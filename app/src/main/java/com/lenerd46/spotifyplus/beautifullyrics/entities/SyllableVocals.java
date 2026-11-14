package com.lenerd46.spotifyplus.beautifullyrics.entities;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.util.TypedValue;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewParent;
import android.view.animation.OvershootInterpolator;
import android.widget.LinearLayout;
import com.google.android.flexbox.FlexboxLayout;
import com.lenerd46.spotifyplus.References;
import com.lenerd46.spotifyplus.beautifullyrics.entities.lyrics.SyllableMetadata;
import de.robv.android.xposed.XposedBridge;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public class SyllableVocals implements SyncableVocals {
    public final FlexboxLayout container;

    public final double startTime;
    public final double duration;
    public final List<AnimatedSyllable> syllables;
    public final boolean isBackground;
    private boolean secondary;
    private final Activity activity;

    public boolean active;
    private LyricState state;
    private final Typeface font;
    private final int fontSize;

    public final ActivityChangedSource activityChanged;
    public final SharedPreferences prefs;
    public final boolean appleStyle;
    private final boolean calmerMotion;

    private static final Spline SCALE_SPLINE = new Spline(
            List.of(0d, 0.7d, 1d),
            List.of(1d, 1.03d, 1d)
    );
    private static final Spline EMPHASISED_SCALE_SPLINE = new Spline(
            List.of(0d, 0.3d, 1d),
            List.of(1d, 1.25d, 1d)
    );
    private static final Spline Y_OFFSET_APPLE_SPLINE = new Spline(
            List.of(0d, 0.8d, 1d),
            List.of(1d / 100d, -(1d / 30d), -(1d / 25d))
    );
    private static final Spline Y_OFFSET_DEFAULT_SPLINE = new Spline(
            List.of(0d, 0.9d, 1d),
            List.of(1d / 100d, -(1d / 60d), 0d)
    );
    private static final Spline GLOW_SPLINE = new Spline(
            List.of(0d, 0.15d, 0.6d, 1d),
            List.of(0d, 1d, 1d, 0d)
    );
    private final Spline yOffsetSpline;

    private static final int[] ACTIVE_COLORS_PRIMARY = { 0xFFFFFFFF, 0x78FFFFFF };
    private static final int[] ACTIVE_COLORS_SECONDARY = { 0xD9FFFFFF, 0x50FFFFFF };
    private static final int[] IDLE_COLORS_PRIMARY = { 0xFFFFFFFF, 0x3CFFFFFF };
    private static final int[] IDLE_COLORS_SECONDARY = { 0xBEFFFFFF, 0x30FFFFFF };

    public SyllableVocals(FlexboxLayout lineContainer, List<SyllableMetadata> syllables, boolean isBackground, boolean isRomanized, boolean oppositeAligned, Activity activity, int fontSize) {
        this(lineContainer, syllables, isBackground, isRomanized, oppositeAligned, activity, fontSize, false);
    }

    public SyllableVocals(FlexboxLayout lineContainer, List<SyllableMetadata> syllables, boolean isBackground,
            boolean isRomanized, boolean oppositeAligned, Activity activity, int fontSize, boolean secondary) {
        this.container = lineContainer;
        List<View> views = new ArrayList<>();
        this.activity = activity;
        this.syllables = new ArrayList<>();
        activityChanged = new ActivityChangedSource();
        font = References.beautifulFont.get();
        prefs = activity.getSharedPreferences("SpotifyPlus", Context.MODE_PRIVATE);
        this.fontSize = fontSize;
        this.secondary = secondary;
        this.calmerMotion = LyricsPhase3Settings.isCalmerMotion(prefs);

        if(prefs.getString("lyric_animation_style", "Beautiful Lyrics").equals("Apple Music")) {
            yOffsetRange = List.of(
                    Map.entry(0d, 1d / 100d), // Lowest
                    Map.entry(0.8d, -(1d / 30d)), // Highest
                    Map.entry(1d, -(1d / 25d)) // Resting
            );
            yOffsetSpline = Y_OFFSET_APPLE_SPLINE;
            appleStyle = true;
        } else {
            yOffsetRange = List.of(
                    Map.entry(0d, 1d / 100d),
                    Map.entry(0.9d, -(1d / 60d)),
                    Map.entry(1d, 0d)
            );
            yOffsetSpline = Y_OFFSET_DEFAULT_SPLINE;
            appleStyle = false;
        }

        active = false;
        this.isBackground = isBackground;

        startTime = syllables.get(0).startTime;
        duration = syllables.get(syllables.size() - 1).endTime - startTime + 0.3d;

        List<List<SyllableMetadata>> syllableGroups = new ArrayList<>();
        List<SyllableMetadata> currentGroup = new ArrayList<>();

        // Go through and create our syllable groups
        for(var syllableMetadata : syllables) {
            currentGroup.add(syllableMetadata);

            if(!syllableMetadata.isPartOfWord) {
                syllableGroups.add(currentGroup);
                currentGroup = new ArrayList<>();
            }
        }

        if(!currentGroup.isEmpty()) {
            syllableGroups.add(currentGroup);
        }

        // Go through and start building our visuals
        for(var syllableGroup : syllableGroups) {
            int syllableCount = syllableGroup.size();
            boolean isInWordGroup = syllableCount > 1;

            int index = 0;

            LinearLayout wordGroup = null;
            boolean firstSyllable = true;

            for(var syllableMetadata : syllableGroup) {
                boolean isEmphasized = syllableMetadata.endTime - syllableMetadata.startTime >= 1 && (isRomanized ? syllableMetadata.romanizedText.length() <= 12 : syllableMetadata.text.length() <= 12);

                GradientTextView textView = new GradientTextView(activity);

                List<AnimatedLetter> letters = new ArrayList<>();
                LinearLayout emphasisGroup = new LinearLayout(activity);
                emphasisGroup.setOrientation(LinearLayout.HORIZONTAL);
                emphasisGroup.setClipToPadding(false);
                emphasisGroup.setClipChildren(false);

                if(!syllableMetadata.isPartOfWord) {
                    if(!isEmphasized) {
                        if(wordGroup != null) {
                            if(isBackground || secondary) { backgroundLyricLabelStyle(textView); }  else { lyricLabelStyle(textView); }
                            textView.setText(isRomanized ? syllableMetadata.romanizedText : syllableMetadata.text);

                            wordGroup.addView(textView);
                            views.add(wordGroup);

                            wordGroup = null;
                        } else {
                            if(isBackground || secondary) { backgroundLyricLabelStyle(textView); }  else { lyricLabelStyle(textView); }
                            textView.setText(isRomanized ? syllableMetadata.romanizedText : syllableMetadata.text);

                            views.add(textView);
                        }
                    } else {
                        List<String> letterTexts = (isRomanized ? syllableMetadata.romanizedText : syllableMetadata.text).chars().mapToObj(c -> String.valueOf((char) c)).collect(Collectors.toList());

                        double relativeTimestep = 1d / letterTexts.size();

                        letters.clear();
                        double relativeTimestamp = 0;

                        for(var letter : letterTexts) {
                            GradientTextView letterView = new GradientTextView(activity);
                            letterView.setText(letter);
                            emphasisGroup.setPadding(0, 0, dpToPx(5), 0);

                            if(isBackground || secondary) { backgroundEmphasizedLyricLabelStyle(letterView); }  else { emphasizedLyricLabelStyle(letterView); }

                            emphasisGroup.addView(letterView);

                            LiveText liveText = new LiveText(letterView, createSprings());
                            AnimatedLetter animatedLetter = new AnimatedLetter(relativeTimestamp, relativeTimestep, 1 - relativeTimestamp, liveText);
                            letters.add(animatedLetter);

                            relativeTimestamp += relativeTimestep;
                        }

                        if(wordGroup != null) {
                            wordGroup.addView(emphasisGroup);
                            views.add(wordGroup);
                        } else {
                            views.add(emphasisGroup);
                        }
                    }
                } else {
                    if(!isEmphasized) {
                        if(wordGroup == null) {
                            wordGroup = new LinearLayout(activity);
                            wordGroup.setOrientation(LinearLayout.HORIZONTAL);
                            wordGroup.setClipToPadding(false);
                            wordGroup.setClipChildren(false);
                        }

                        if(isBackground || secondary) { backgroundEmphasizedLyricLabelStyle(textView); } else { emphasizedLyricLabelStyle(textView); }
                        textView.setText(isRomanized ? syllableMetadata.romanizedText : syllableMetadata.text);

                        wordGroup.addView(textView);
                    } else {
                        List<String> letterTexts = (isRomanized ? syllableMetadata.romanizedText : syllableMetadata.text).chars().mapToObj(c -> String.valueOf((char) c)).collect(Collectors.toList());
                        double relativeTimestep = 1d / letterTexts.size();

                        letters.clear();
                        double relativeTimestamp = 0;

                        for(var letter : letterTexts) {
                            GradientTextView letterView = new GradientTextView(activity);
                            letterView.setText(letter);
                            if(isBackground || secondary) { backgroundEmphasizedLyricLabelStyle(letterView); }  else { emphasizedLyricLabelStyle(letterView); }

                            emphasisGroup.addView(letterView);

                            LiveText liveText = new LiveText(letterView, createSprings());
                            AnimatedLetter animatedLetter = new AnimatedLetter(relativeTimestamp, relativeTimestep, 1 - relativeTimestamp, liveText);
                            letters.add(animatedLetter);

                            relativeTimestamp += relativeTimestep;
                        }

                        if(wordGroup == null) {
                            wordGroup = new LinearLayout(activity);
                            wordGroup.setOrientation(LinearLayout.HORIZONTAL);
                            wordGroup.setClipToPadding(false);
                            wordGroup.setClipChildren(false);
                        }
                        wordGroup.addView(emphasisGroup);
                    }
                }

                double relativeStart = syllableMetadata.startTime - startTime;
                double relativeEnd = syllableMetadata.endTime - startTime;

                double relativeStartScale = relativeStart / duration;
                double relativeEndScale = relativeEnd / duration;

                double duration = relativeEnd - relativeStart;
                double durationScale = relativeEndScale - relativeStartScale;

                LiveText liveText = new LiveText(isEmphasized ? emphasisGroup : textView, createSprings());

                if(isEmphasized) {
                    AnimatedSyllable animatedSyllable = new AnimatedSyllable(relativeStart, duration, relativeStartScale, durationScale, liveText, "Letters", letters);
                    this.syllables.add(animatedSyllable);
                } else {
                    AnimatedSyllable animatedSyllable = new AnimatedSyllable(relativeStart, duration, relativeStartScale, durationScale, liveText, "Syllable", null);
                    this.syllables.add(animatedSyllable);
                }

                index++;
            }
        }

        views.forEach(this.container::addView);
        setToGeneralState(false);
    }

    public void setSecondary(boolean secondary) {
        if (this.secondary == secondary) {
            return;
        }
        this.secondary = secondary;
        float textSize = secondary ? Math.max(18f, fontSize * 0.7f) : fontSize;

        for (AnimatedSyllable syllable : syllables) {
            if (syllable.type.equals("Letters")) {
                for (AnimatedLetter letter : syllable.letters) {
                    if (letter.liveText.object instanceof GradientTextView) {
                        ((GradientTextView) letter.liveText.object).setTextSize(textSize);
                    }
                }
            } else if (syllable.liveText.object instanceof GradientTextView) {
                ((GradientTextView) syllable.liveText.object).setTextSize(textSize);
            }
        }
        evaluateClassState();
    }

    private Springs createSprings() {
        return new Springs(new Spring(0, 0.6d, 0.7d), new Spring(0, 0.4d, 1.25d), new Spring(0, 0.5d, 1d));
    }

    private void setToGeneralState(boolean state) {
        double timeScale = state ? 1 : 0;

        for(var syllable : syllables) {
            updateLiveTextState(syllable.liveText, timeScale, timeScale, true, false);
            updateLiveTextVisuals(syllable.liveText, false, timeScale, 0);

            if(syllable.type.equals("Letters")) {
                for(var letter : syllable.letters) {
                    updateLiveTextState(letter.liveText, timeScale, timeScale, true, true);
                    updateLiveTextVisuals(letter.liveText, true, timeScale, 0);
                }
            }
        }

        this.state = state ? LyricState.SUNG : LyricState.IDLE;
    }

    private void evaluateClassState() {
        try {
            Runnable applyState = () -> {
                if(this.state == LyricState.ACTIVE) {
                    int[] activeColors = secondary ? ACTIVE_COLORS_SECONDARY : ACTIVE_COLORS_PRIMARY;
                    int activeTextColor = Color.argb(secondary ? 217 : 255, 255, 255, 255);
                    for(var syllable : this.syllables) {
                        if(syllable.type.equals("Letters")) {
                            for(var letter : syllable.letters) {
                                GradientTextView text = (GradientTextView) letter.liveText.object;
                                text.setGradientColors(activeColors);
                                text.setTextColor(activeTextColor);
                            }
                        } else {
                            GradientTextView text = (GradientTextView) syllable.liveText.object;
                            text.setGradientColors(activeColors);
                            text.setTextColor(activeTextColor);
                        }
                    }
                } else if(this.state == LyricState.SUNG) {
                    int sungTextColor = Color.argb(secondary ? 72 : 100, 255, 255, 255);
                    for(var syllable : this.syllables) {
                        if(syllable.type.equals("Letters")) {
                            for(var letter : syllable.letters) {
                                GradientTextView text = (GradientTextView) letter.liveText.object;
                                text.setTextColor(sungTextColor);
                                text.updateShadow(0f, 0f);
                            }
                        } else {
                            GradientTextView text = (GradientTextView) syllable.liveText.object;
                            text.setTextColor(sungTextColor);
                            text.updateShadow(0f, 0f);
                        }
                    }

                    if (!secondary && !calmerMotion) {
                        ViewParent parent = container.getParent();
                        ViewParent grandparent = parent == null ? null : parent.getParent();
                        if(grandparent instanceof View) ((View) grandparent).animate().scaleX(1.0f).scaleY(1.0f).setDuration(800).setInterpolator(new OvershootInterpolator()).start();
                    }
                } else {
                    int[] idleColors = secondary ? IDLE_COLORS_SECONDARY : IDLE_COLORS_PRIMARY;
                    int idleTextColor = Color.argb(secondary ? 190 : 255, 255, 255, 255);
                    for(var syllable : this.syllables) {
                        if(syllable.type.equals("Letters")) {
                            for(var letter : syllable.letters) {
                                GradientTextView text = (GradientTextView) letter.liveText.object;
                                text.setTextColor(idleTextColor);
                                text.setGradientColors(idleColors);
                                text.updateShadow(0f, 0f);
                            }
                        } else {
                            GradientTextView text = (GradientTextView) syllable.liveText.object;
                            text.setTextColor(idleTextColor);
                            text.setGradientColors(idleColors);
                            text.updateShadow(0f, 0f);
                        }
                    }
                }
            };
            if (android.os.Looper.myLooper() == android.os.Looper.getMainLooper()) {
                applyState.run();
            } else {
                container.post(applyState);
            }
        } catch(Exception e) {
            XposedBridge.log(e);
        }
    }

    public void updateLiveTextState(LiveText liveText, double timeScale, double glowTimeScale, boolean forceTo, boolean isEmphasized) {
        if (calmerMotion) {
            liveText.springs.scale.set(1.0d);
            liveText.springs.yOffset.set(0.0d);
            liveText.springs.glow.set(0.0d);
            return;
        }
        Spline scaleSpline = (appleStyle && isEmphasized && this.state == LyricState.ACTIVE) ? EMPHASISED_SCALE_SPLINE : SCALE_SPLINE;

        double scale = scaleSpline.at(timeScale);
        double yOffset = yOffsetSpline.at(timeScale);
        double glow = GLOW_SPLINE.at(glowTimeScale);

        if(forceTo) {
            liveText.springs.scale.set(scale);
            liveText.springs.yOffset.set(yOffset);
            liveText.springs.glow.set(glow);
        } else {
            liveText.springs.scale.finalPosition = scale;
            liveText.springs.yOffset.finalPosition = yOffset;
            liveText.springs.glow.finalPosition = glow;
        }
    }

    private boolean updateLiveTextVisuals(LiveText liveText, boolean isEmphasized, double timeScale, double deltaTime) {
        double scale = liveText.springs.scale.update(deltaTime);
        double yOffset = liveText.springs.yOffset.update(deltaTime) * 100;
        double glow = Math.abs(liveText.springs.glow.update(deltaTime));

        float gradientProgress = (int)Math.round(-20 + 120 * timeScale);
        float shadowRadius = 4 * (2 * (float)glow * (isEmphasized ? 3f : 1f))
                * (secondary ? 0.6f : 1f);
        float shadowOpacity = (float)Math.max(0, Math.min(1, glow * (isEmphasized ? 1f : 0.35f)))
                * (secondary ? 0.55f : 1f);

        if(liveText.object instanceof GradientTextView) {
            if(Double.isNaN(scale) || Double.isInfinite(scale)) { return false; }

            GradientTextView textView = (GradientTextView)liveText.object;
            float finalScale = (float)scale;
            float finalY = (float)yOffset * (!appleStyle && isEmphasized ? 2f : 1f);
            float finalShadowOpacity = shadowOpacity * 100f;

            if (android.os.Looper.myLooper() == android.os.Looper.getMainLooper()) {
                textView.setScaleX(finalScale);
                textView.setScaleY(finalScale);
                textView.setTranslationY(finalY);
                textView.setProgress(gradientProgress);
                textView.updateShadow(finalShadowOpacity, shadowRadius);
            } else {
                textView.post(() -> {
                    textView.setScaleX(finalScale);
                    textView.setScaleY(finalScale);
                    textView.setTranslationY(finalY);
                    textView.setProgress(gradientProgress);
                    textView.updateShadow(finalShadowOpacity, shadowRadius);
                });
            }
        }

        return liveText.springs.scale.sleeping && liveText.springs.yOffset.sleeping && liveText.springs.glow.sleeping;
    }

    private Spline getSpline(List<Map.Entry<Double, Double>> range) {
        return new Spline(range.stream().map(Map.Entry::getKey).collect(Collectors.toList()), range.stream().map(Map.Entry::getValue).collect(Collectors.toList()));
    }

    @Override
    public void animate(double songTimestamp, double deltaTime, boolean isImmediate) {
        double relativeTime = songTimestamp - this.startTime;

        boolean pastStart = relativeTime >= 0;
        boolean beforeEnd = relativeTime <= this.duration;
        boolean isActive = pastStart && beforeEnd;
        this.active = isActive;

        LyricState stateNow = isActive ? LyricState.ACTIVE : pastStart ? LyricState.SUNG : LyricState.IDLE;

        boolean stateChanged = stateNow != this.state;
        boolean shouldUpdateVisualState = stateChanged || isActive || isImmediate;

        if(stateChanged) {
            this.state = stateNow;
            evaluateClassState();

            // Trigger scrolling event
            if(this.state == LyricState.ACTIVE) {
                activityChanged.invoke(new ScrollInformation(container, isImmediate));
            }
        }

        if(stateNow == LyricState.ACTIVE && isImmediate) {
            activityChanged.invoke(new ScrollInformation(container, true));
        }

        boolean isSleeping1 = !shouldUpdateVisualState;
        boolean isMoving = isSleeping1 == false;

        if(shouldUpdateVisualState || isMoving) {
            double timeScale = Math.max(0, Math.min((double)relativeTime / (double)this.duration, 1));
            boolean isSleeping = true;

            for(var syllable : this.syllables) {
                double syllableTimeScale = Math.max(0, Math.min((double)(timeScale - syllable.startScale) / (double)syllable.durationScale, 1));

                if(syllable.type.equals("Letters")) {
                    double timeAlpha = Math.sin(syllableTimeScale * (Math.PI / 2));

                    for(var letter : syllable.letters) {
                        double letterTime = timeAlpha - letter.start;
                        double letterTimeScale = Math.max(0, Math.min(letterTime / letter.duration, 1));
                        double glowTimeScale = Math.max(0, Math.min(letterTime / letter.glowDuration, 1));

                        if(shouldUpdateVisualState) {
                            updateLiveTextState(letter.liveText, letterTimeScale, glowTimeScale, isImmediate, true);
                        }

                        if(isMoving) {
                            boolean letterIsSleeping = updateLiveTextVisuals(letter.liveText, true, letterTimeScale, deltaTime);

                            if(!letterIsSleeping) {
                                isSleeping = false;
                            }
                        }
                    }
                }

                if(shouldUpdateVisualState) {
                    updateLiveTextState(syllable.liveText, syllableTimeScale, syllableTimeScale, isImmediate, false);
                }

                if(isMoving) {
                    boolean syllableIsSleeping = updateLiveTextVisuals(syllable.liveText, false, syllableTimeScale, deltaTime);

                    if(!syllableIsSleeping) {
                        isSleeping = false;
                    }
                }
            }

            if(isSleeping) {
                isSleeping1 = true;

                if(!isActive) {
                    evaluateClassState();
                }
            }
        }
    }

    @Override
    public boolean isActive() {
        return active;
    }

    private final List<Map.Entry<Double, Double>> scaleRange = List.of(
            Map.entry(0d, 1d), // Lowest
            Map.entry(0.7d, 1.03d), // Highest
            Map.entry(1d, 1d) // Resting
    );

    private final List<Map.Entry<Double, Double>> emphasisedScaleRange =
            List.of(
                    Map.entry(0d, 1d),
                    Map.entry(0.3d, 1.25d),
                    Map.entry(1d, 1d)
            );


    private final List<Map.Entry<Double, Double>> yOffsetRange;

    private final List<Map.Entry<Double, Double>> glowRange = List.of(
            Map.entry(0d, 0d), // Lowest
            Map.entry(0.15d, 1d), // Highest
            Map.entry(0.6d, 1d), // Sustain
            Map.entry(1d, 0d) // Resting
    );

    private void lyricLabelStyle(GradientTextView text) {
        text.setTextColor(0xFFE0E0E0);
        text.setTextSize(fontSize);
        text.setPadding(0,0,dpToPx(1),0);
        text.setTypeface(font);

        FlexboxLayout.LayoutParams params = new FlexboxLayout.LayoutParams(FlexboxLayout.LayoutParams.WRAP_CONTENT, FlexboxLayout.LayoutParams.WRAP_CONTENT);
        params.setMargins(0, 0, dpToPx(5), 0);
        text.setLayoutParams(params);
    }

    private void backgroundLyricLabelStyle(GradientTextView text) {
        text.setTextColor(0xFFE0E0E0);
        text.setTextSize(secondary ? Math.max(18f, fontSize * 0.7f) : 18f);
        text.setPadding(0,0,dpToPx(1),0);
        text.setTypeface(font);

        FlexboxLayout.LayoutParams params = new FlexboxLayout.LayoutParams(FlexboxLayout.LayoutParams.WRAP_CONTENT, FlexboxLayout.LayoutParams.WRAP_CONTENT);
        params.setMargins(0, 0, dpToPx(5), 0);
        text.setLayoutParams(params);
    }

    private void emphasizedLyricLabelStyle(GradientTextView text) {
        text.setTextColor(0xFFE0E0E0);
        text.setTextSize(fontSize);
        text.setTypeface(font);
    }

    private void backgroundEmphasizedLyricLabelStyle(GradientTextView text) {
        text.setTextColor(0xFFE0E0E0);
        text.setTextSize(secondary ? Math.max(18f, fontSize * 0.7f) : 18f);
        text.setTypeface(font);
    }

    int dpToPx(int dp) {
        return (int) TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP,
                dp,
                activity.getResources().getDisplayMetrics()
        );
    }
}
