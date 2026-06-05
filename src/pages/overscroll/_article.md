---
tag: article
---

# CSS `overscroll-behavior` rubber banding: how to show the right color behind the site when you pull it

I think you all know the overscroll rubber-banding effect: when you scroll past the end of a page, or pull past the top, the content bounces back. It exists in all modern browsers, though each one has its own idea of how far you can pull. Desktop Chrome has a surprisingly long pull — I managed to drag the page by ~70% of the window height. Firefox barely budges, around 10%. Safari, on macOS and mobile, sits comfortably in the middle at 40–50%.

Personally, I find this effect quite enjoyable — it adds a nice touch to the user experience. But it comes with one huge catch: there is no CSS property or API to fill the space 'behind' the content when it's pulled. Yes, you can set a background color on the body, but that only works if your background is one solid color, shared by the header and footer. Which, let's be honest, is not the case for most websites. Some sites just set `overscroll-behavior: none` and call it a day — but it's a shame to lose such a nice effect over this.

Building a custom pull effect with JS isn't always a good idea either, especially for a simple landing page that doesn't need any special pull actions (calling a server, loading more content, and so on).

Worth mentioning: there is a new proposal, [Declarative Overscroll Actions](https://open-ui.org/components/overscroll-actions.explainer/), in the early stages of development. It's not clear yet whether it will give us an easy way to color the overscroll area, but I can see the potential for it somewhere in the future.

So there I was, stuck with a pretty simple landing page with a light-to-dark gradient from header to footer. On my way to solving this problem I ran into a lot of 'stranger things', and here I want to share my small findings on how to make it work more or less right.

You can find a demo of all this stuff here.
The important CSS file is here.

## Gradient background

The first idea was to set a background on the body. Not a solid color, but a gradient. Here's the catch: a solid color on `<html>` or `<body>` fills the 'bounce' area; a `linear-gradient`, `radial-gradient` or `conic-gradient` does not.

But if you create a pseudo-element like `html::before` or `body::before` — it does. Including all types of gradients! With one very annoying issue: it has to be `position: fixed`. Absolute positioning won't do — the element is positioned relative to the body, so when you pull the page, it gets pulled along with the content.

Fixed positioning solves that, but creates a new problem: the element ignores scrolling completely. So if your gradient goes from light at the top to dark at the bottom, you can't continue the gradient into the overscroll area. At best, you can extend the gradient's outermost colors as solid fills: light at the start, dark at the end. It looks more or less good.

--||--
Here I need to stop and bring up one more aggravating circumstance: rubber banding happens on horizontal pulls too. And it often looks worse than the vertical one — designs tend to have differently colored sections, full-bleed photos, and so on. In a perfect world we might fill these areas with some kind of ambient-light effect, and even then I'm not sure it would fit. Honestly, I prefer to turn horizontal overscrolling off. It's a one-liner — `overscroll-behavior-x: none` on body/html — and no big loss for most websites. What's more, iOS Safari behaves this way by default.
--||--

I should stress that conic or radial gradients rarely make sense for overscroll areas anyway, since the pseudo-element is fixed and doesn't react to scroll at all.
Here is the code for the gradient background (white to black, for example):

```css
body::before {
  pointer-events: none;
  content: "";

  position: fixed;
  z-index: -1;
  inset: 0;

  width: 100%;
  height: 100%;

  background-image: linear-gradient(white 0%, white 50%, black 50%, black 100%);
  background-repeat: no-repeat;
}
```

The important part: I split the gradient at 50% not just for fun — but because the user can pull the page for fun! And this is the first obstacle on the road to perfection. Pull diligently enough in Chrome, and the page moves by 70% of the window height. From both sides! So this approach works — with a big BUT.

## Fixed elements

Next, I tried fixed elements that live within the page borders and kind of continue the page into the void. Let's attach them to the header and footer. In reality, I hit the same wall as with the gradient background: absolute positioning is out (pulled along with the content), so they have to be fixed — and fixed elements ignore scroll. You end up splitting them into two halves, and if the user pulls the page by 70% of the window height... you know the drill.

```css
.header::after,
.footer::after {
  content: "";
  position: fixed;
  z-index: -1;
  left: 0;
  width: 100dvw;
  height: 50dvh;
}

header::after {
  top: 0;
  background-color: var(--color-bg-light);
}

footer::after {
  bottom: 0;
  background-color: var(--color-bg-dark);
}
```

## Animation

At this point I remembered that we have a [new API for scroll-linked animations](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/animation-timeline/scroll). Yes, still early days, but it's already supported in Chrome and Safari (Firefox is on the way). So the idea: move those fixed elements together with the scroll, like this:

```css
/* in addition to the previous code */
header::after,
footer::after {
  transform-origin: top;
  height: 100dvh;
  animation: scale-part;
  animation-timeline: scroll();
}

footer::after {
  animation-direction: alternate-reverse;
}

@keyframes scale-part {
  from {
    transform: scaleY(1);
  }

  to {
    transform: scaleY(0);
  }
}
```

Note that when the scroll reaches the end of the page, the animation grows the fixed footer block to 100dvh — so even a 70% pull won't break the illusion. Same for the header, but in reverse. Great! Except it doesn't work in Safari. Chrome only... so-so choice.

## Safari?

The struggle with Safari led me to change the way the animation works. Instead of scaling a fixed element, let's animate the body background color itself. Why not? The user doesn't see this layer anyway — it sits behind the content and only peeks out at the outermost positions. The CSS is delightfully simple:

```css
html {
  animation: scroll-background;
  animation-timeline: scroll();
}

@keyframes scroll-background {
  from {
    background-color: white;
  }

  to {
    background-color: black;
  }
}
```

And it works! In Safari! And in Chrome! Firefox...

## Universal solution?

I tried different approaches, and at some point I decided to give up on Firefox, for two reasons: it has a short pull and a small share of users (sorry, Firefox — I love you anyway and hope you'll support scroll animations soon). For Firefox we should at least keep a monotone background; better than nothing. I'd recommend the site's main background color, so the fill stays aligned with the design.
The final solution:

```css
html {
  animation: scroll-background;
  animation-timing-function: linear;
  animation-timeline: scroll();
  background-color: black;
}

@keyframes scroll-background {
  from {
    background-color: white;
  }

  to {
    background-color: black;
  }
}
```

And now, some interesting observations.
Safari is not so simple. Apple loves to push the boundaries of design — literally. At the top of the desktop browser it shows a blurred version of the open page, and of course it uses the defined background color as a base. The animation there is smooth but a bit unpredictable — I suspect the system tries to find a contrasting color for this blurred layer, so the animation is not exactly linear. In mobile Safari, in contrast, the same animation happens at the bottom of the page and looks even more interesting.

Remember that you can control how the animation behaves — at which point of the scroll the colors change — and if you play with it, you can achieve some interesting effects in mobile Safari.

## A sober afterword: weaknesses, and what would actually fix this

Time for some cold water. The final solution works, but it is a hack standing on another hack's shoulders and has a few weaknesses:

- **Repaint cost.** Background color on the root is not a compositor-friendly property: every scroll frame triggers paint work on the main thread. The browser might optimize it in some way, since this layer is hidden behind the content, but that's not guaranteed. I checked the performance in Safari and Chrome and it seems fine, even on mobile — but keep it in mind. Scroll-linked animations are not free, especially when they trigger paint work. The fixed-elements approach is more efficient, since it only animates `transform`.
- **Short pages break it.** If the page doesn't scroll, `scroll()` has no timeline, the animation never runs, and the fallback `background-color: black` shows behind a light header. You need a guard for non-scrolling pages.
- **It only handles vertical overscroll.** Horizontal pulls are still a problem.
- **The content must be fully opaque.** Any transparent gap in the body lets the user watch the background morph from white to black mid-scroll. That one is fun to debug.

How could it be solved properly? Honestly — only by the platform. Overscroll is drawn by the browser outside the document, so every CSS trick is, by definition, an illusion stitched to scroll position. [Declarative Overscroll Actions](https://open-ui.org/components/overscroll-actions.explainer/) is the closest thing on the horizon, since it anchors real, styleable elements into the overscroll area; until something like it ships, a dedicated `overscroll`-background property remains wishful thinking.

And one last sobering thought: elastic overscroll effectively exists only on macOS and iOS. Windows, Linux and most Android users will never see any of this effort. But this is exactly the kind of detail 99% of visitors will never consciously notice, yet it's what makes a site feel hand-made and cared for. Small win, big smile. Happy overscrolling!
