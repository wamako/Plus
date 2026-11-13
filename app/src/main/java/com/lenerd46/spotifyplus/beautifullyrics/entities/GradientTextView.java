package com.lenerd46.spotifyplus.beautifullyrics.entities;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.*;
import android.util.AttributeSet;
import android.widget.TextView;

@SuppressLint("AppCompatCustomView")
public class GradientTextView extends TextView {
    private int[] gradientColors = { 0xFFFFFFFF, 0x3CFFFFFF }; // 0xE6C8C8C8
    private float progress = 0f;

    private float shadowOpacity = 0f;
    private float shadowRadius = 0f;
    private boolean isLine = false;

    private LinearGradient activeShader;
    private final Matrix shaderMatrix = new Matrix();
    private boolean shaderDirty = true;
    private float cachedTextWidth = -1f;
    private CharSequence lastMeasuredText = null;
    private float lastMeasuredSize = -1f;

    public GradientTextView(Context context) {
        super(context);
    }

    public GradientTextView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    public GradientTextView(Context context, AttributeSet attrs, int defStyle) {
        super(context, attrs, defStyle);
    }

    @Override
    protected void onTextChanged(CharSequence text, int start, int lengthBefore, int lengthAfter) {
        super.onTextChanged(text, start, lengthBefore, lengthAfter);
        cachedTextWidth = -1f;
    }

    @Override
    protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        super.onSizeChanged(w, h, oldw, oldh);
        cachedTextWidth = -1f;
    }

    private void ensureShader() {
        if (!shaderDirty && activeShader != null) return;
        // Unit gradient [0..1] along X (for syllables) or Y (for lines); scaled & translated via shaderMatrix
        if (!isLine) {
            activeShader = new LinearGradient(0f, 0f, 1f, 0f, gradientColors[0], gradientColors[1], Shader.TileMode.CLAMP);
        } else {
            activeShader = new LinearGradient(0f, 0f, 0f, 1f, gradientColors[0], gradientColors[1], Shader.TileMode.CLAMP);
        }
        shaderDirty = false;
    }

    @Override
    protected void onDraw(Canvas canvas) {
        Paint paint = getPaint();
        float gradientProgress = Math.max(0f, Math.min(progress, 1f));

        if (gradientProgress <= 0f) {
            paint.setShader(null);
            paint.setColor(gradientColors[1]);
        } else if (gradientProgress >= 1f) {
            paint.setShader(null);
            paint.setColor(gradientColors[0]);
        } else {
            ensureShader();
            final float fadeSpan = 0.3f;
            float startFade = Math.max(0f, gradientProgress - fadeSpan / 2f);
            float endFade = Math.min(1f, gradientProgress + fadeSpan / 2f);
            float span = Math.max(0.001f, endFade - startFade);

            if (!isLine) {
                CharSequence currentText = getText();
                float textSize = paint.getTextSize();
                if (cachedTextWidth < 0f || currentText != lastMeasuredText || textSize != lastMeasuredSize) {
                    cachedTextWidth = currentText != null ? paint.measureText(currentText, 0, currentText.length()) : 0f;
                    lastMeasuredText = currentText;
                    lastMeasuredSize = textSize;
                }
                float width = Math.max(1f, cachedTextWidth);
                shaderMatrix.setScale(width * span, 1f);
                shaderMatrix.postTranslate(width * startFade, 0f);
            } else {
                float height = Math.max(1f, getHeight());
                shaderMatrix.setScale(1f, height * span);
                shaderMatrix.postTranslate(0f, height * startFade);
            }

            activeShader.setLocalMatrix(shaderMatrix);
            paint.setShader(activeShader);
        }

        if (shadowRadius > 0f && shadowOpacity > 0f) {
            int alpha = Math.max(0, Math.min(255, Math.round(255f * (shadowOpacity / 100f))));
            paint.setShadowLayer(shadowRadius, 0f, 0f, (alpha << 24) | 0x00FFFFFF);
        } else {
            paint.clearShadowLayer();
        }

        super.onDraw(canvas);
    }

    public void setGradientColors(int[] gradientColors) {
        if (gradientColors != null && gradientColors.length >= 2) {
            if (this.gradientColors[0] == gradientColors[0] && this.gradientColors[1] == gradientColors[1]) {
                return;
            }
            this.gradientColors = gradientColors;
            this.shaderDirty = true;
            invalidate();
        }
    }

    public void setLineState(boolean isLine) {
        if (this.isLine != isLine) {
            this.isLine = isLine;
            this.shaderDirty = true;
        }
    }

    public void updateShadow(float opacity, float radius) {
        if (Math.abs(this.shadowOpacity - opacity) < 0.1f && Math.abs(this.shadowRadius - radius) < 0.05f) {
            return;
        }
        this.shadowOpacity = opacity;
        this.shadowRadius = radius;

        invalidate();
    }

    public void setProgress(float progress) {
        float clamped = Math.max(0f, Math.min(progress / 100f, 1f));
        if (Math.abs(this.progress - clamped) < 0.002f) {
            return;
        }
        this.progress = clamped;
        invalidate();
    }
}
