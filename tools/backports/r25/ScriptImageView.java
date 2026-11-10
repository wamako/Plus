package com.lenerd.spotifyplus.module.scripting;

import android.content.Context;
import android.graphics.drawable.Animatable;
import android.graphics.drawable.Drawable;
import android.view.View;
import android.widget.ImageView;

final class ScriptImageView extends ImageView {
    ScriptImageView(Context context) { super(context); }

    @Override
    public void setImageDrawable(Drawable drawable) {
        if (getDrawable() != drawable && getDrawable() instanceof Animatable animation) animation.stop();
        super.setImageDrawable(drawable);
        updateAnimation();
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        updateAnimation();
    }

    @Override
    protected void onDetachedFromWindow() {
        if (getDrawable() instanceof Animatable animation) animation.stop();
        super.onDetachedFromWindow();
    }

    @Override
    protected void onVisibilityChanged(View changedView, int visibility) {
        super.onVisibilityChanged(changedView, visibility);
        updateAnimation();
    }

    @Override
    protected void onWindowVisibilityChanged(int visibility) {
        super.onWindowVisibilityChanged(visibility);
        updateAnimation();
    }

    private void updateAnimation() {
        if (!(getDrawable() instanceof Animatable animation)) return;
        if (isAttachedToWindow() && isShown() && getWindowVisibility() == VISIBLE) {
            if (!animation.isRunning()) animation.start();
        } else animation.stop();
    }
}
