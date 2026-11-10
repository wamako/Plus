"""Bounded public Drive file download; no login, permissions or URL logging."""
from html.parser import HTMLParser
import re
from urllib.parse import parse_qs, urlencode, urlsplit

HOSTS = {"drive.google.com", "drive.usercontent.google.com"}

def drive_file_id(url):
    parsed = urlsplit(url)
    if parsed.hostname not in HOSTS:
        return None
    if (parsed.scheme != "https" or parsed.username or parsed.password or
            parsed.port not in (None, 443) or parsed.fragment):
        raise ValueError("Unexpected Google Drive source")
    match = re.fullmatch(r"/file/d/([A-Za-z0-9_-]{10,200})/view/?", parsed.path)
    if parsed.hostname == "drive.google.com" and match:
        return match.group(1)
    values = parse_qs(parsed.query)
    ids = values.get("id", [])
    if (parsed.path not in ("/uc", "/download") or len(ids) != 1 or
            not re.fullmatch(r"[A-Za-z0-9_-]{10,200}", ids[0])):
        raise ValueError("Expected a public Google Drive file link")
    return ids[0]

def download_url(url):
    """Accept a sharing URL without needing the Drive viewer's JavaScript."""
    file_id = drive_file_id(url)
    parsed = urlsplit(url)
    if file_id is None or parsed.path in ("/uc", "/download"):
        return url
    fields = {"id": file_id, "export": "download"}
    keys = parse_qs(parsed.query).get("resourcekey", [])
    if keys:
        if len(keys) != 1:
            raise ValueError("Ambiguous Google Drive resource key")
        fields["resourcekey"] = keys[0]
    return "https://drive.usercontent.google.com/uc?" + urlencode(fields)

class ConfirmationParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.forms, self.current = [], None

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "form" and values.get("id") == "download-form":
            if self.current is not None:
                raise ValueError("Nested Drive download forms")
            self.current = {"attrs": values, "fields": []}
            self.forms.append(self.current)
        elif tag == "input" and self.current is not None and values.get("type") == "hidden":
            self.current["fields"].append((values.get("name", ""), values.get("value", "")))

    def handle_endtag(self, tag):
        if tag == "form":
            self.current = None

def confirmation_url(page_url, html, expected_id):
    """Follow only Google's same-file large-download GET confirmation form."""
    page = urlsplit(page_url)
    if page.scheme != "https" or page.hostname not in HOSTS:
        return None
    parser = ConfirmationParser()
    parser.feed(html)
    if not parser.forms:
        return None
    if len(parser.forms) != 1:
        raise ValueError("Ambiguous Drive download form")
    form, = parser.forms
    if (form["attrs"].get("action") != "https://drive.usercontent.google.com/download" or
            form["attrs"].get("method", "get").lower() != "get"):
        raise ValueError("Unexpected Drive confirmation destination")
    fields = dict(form["fields"])
    if (len(fields) != len(form["fields"]) or
            not {"id", "export", "confirm", "uuid"} <= fields.keys() or
            fields.keys() - {"id", "export", "confirm", "uuid", "resourcekey"} or
            fields["id"] != expected_id or fields["export"] != "download" or
            fields["confirm"] != "t" or not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", fields["uuid"])):
        raise ValueError("Unexpected Drive confirmation fields")
    return "https://drive.usercontent.google.com/download?" + urlencode(fields)
