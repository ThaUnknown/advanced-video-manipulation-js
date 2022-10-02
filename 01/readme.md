# Fast Real Time JavaScript Video Manipulation / Postprocessing

Here I'll cover how to manipulate video rendering in a browser. This covers client-side manipulation using HTML and JS, not server-side manipulation.

Note: This article vaguely  overlaps with [MDN's tutorial](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Manipulating_video_using_canvas) but does a few key things differently.

There are quite a few note's throughout this article and they often emphasize important issues so I recommend  you don't skip them.

**Problem to solve: Fast, asynchronous, potentially hardware accelerated video manipulation/postprocessing.**

**Example: Video sharpening and saturation.**

To accomplish this I'll use a canvas, which conveniently can accept a video as an image input. Let's set up the base code.

HTML
```html
  <video src="https://v.animethemes.moe/NoGameNoLife-ED1.webm" controls autoplay muted loop></video>
  <canvas></canvas>
  <script src="./main.js" type="module"></script>
```
JS
```js
class VapourSynthWannabe {
  /**
   * @param  {HTMLVideoElement} video
   * @param  {HTMLCanvasElement} canvas
   */
  constructor (video, canvas) {
    this.destroyed = false
    this.video = video
    this.canvas = canvas
  }

  destroy () {
    this.destroyed = true
  }
}

window.processor = new VapourSynthWannabe(document.querySelector('video'), document.querySelector('canvas'))
// bound to window so you can play around with it in console
```

## Connecting the video element:
```js
// constructor
    video.addEventListener('resize', this.resize.bind(this))
    video.addEventListener('loadedmetadata', this.resize.bind(this))
    this.resize()
// ...
  resize () {
    this.canvas.width = this.video.videoWidth
    this.canvas.height = this.video.videoHeight
  }

  destroy () {
// ...
    this.video.removeEventListener('resize', this.resize)
    this.video.removeEventListener('loadedmetadata', this.resize)
  }
```
Here I created a function which resizes the canvas to whatever the video size is, then I run the function once and connect it to 2 video events, `resize` and `loadedmetadata`. The function is ran once in case the object is constructed after a video has already been loaded which would omit the `loadedmetadata` event. 
The `resize` even can fire in multiple cases but we'll worry about these 2:
- video track change [requires `AudioVideoTracks` enabled in blink engines, or `media.track.enabled` in gecko engines]
- video resolution change

The resolution change being the most notable one which can be most notably used by .webm or .mkv to create some funny videos.

## Rendering the video on the canvas:

```js
// constructor
    this.ctx = canvas.getContext('2d')
    this.timeout = setTimeout(this.processFrame.bind(this), 16)
// ...
  processFrame () {
    this.ctx.drawImage(this.video, 0, 0)
    this.timeout = setTimeout(this.processFrame.bind(this), 16)
  }
  destroy () {
// ...
    clearTimeout(this.timeout)
  }
```

Fairly simple, we get the video at it's original resolution, however this isn't the case for the video framerate and colors space. 

The keen eyed user could notice the marginally green tint on some videos and most people can easily notice the choppy framerate. 

Unfortunately as of now we can't do much about the color space, at best one could decode the video using the WebCodecsAPI instead, but I care about at least basic browser compatibility here, and the WebCodecsAPI is still non-standard so for now I'll pass on it, I might re-visit it in a later post. Fortunately this color accuracy issue doesn't occur that often.

The reason the video is choppy is really simple, the output frametimes don't match the video frametimes. Here's a very good and simple visualization of the problem courtesy of Battle(non)sense: https://youtube.com/clip/UgkxAKXcngeSVrEQ0rStPcECvzbP9XHCdHDF

But there's an issue. The browser doesn't expose any useful video metadata and as such we don't really have a concept of a framerate. Then again FPS would be useless for [VFR](https://en.wikipedia.org/wiki/Variable_frame_rate), so to solve this issue I'll need to paint a video frame to the canvas each time the video presents a frame.

Google is here to save the day however with [requestVideoFrameCallback](https://wicg.github.io/video-rvfc/) which safari also supports, but as always firefox is lacking.


Fortunately I created a [polyfill](https://github.com/ThaUnknown/rvfc-polyfill/) using `requestAnimationFrame` and `getVideoPlaybackQuality` which are supported in all browsers. It's not perfect but it's close enough. This API is perfect as it's functionality is pretty much exact to what timeouts do.

## Fixing framerate issues:

```js
import 'https://esm.sh/rvfc-polyfill'

// ...
// constructor
    this.callback = video.requestVideoFrameCallback(this.processFrame.bind(this))
// ...
  processFrame () {
    this.ctx.drawImage(this.video, 0, 0)
    this.callback = this.video.requestVideoFrameCallback(this.processFrame.bind(this))
  }
  destroy () {
// ...
    this.video.cancelVideoFrameCallback(this.callback)
  }
```
Perfect! This solves the issue of choppy framerates, potential frame loss and now we don't need to worry about loosing performance by processing the same frame multiple times or handling the video state itself. VFR videos will also render correctly, and insanely high framerate videos will be butter smooth.

Note: This API checks if a video frame was painted, if the video element isn't visible &/ mounted on the DOM it will not paint new frames, or will paint them at a reduced rate. Browsers do this to save on performance, which is completely reasonable. If your video element was created using `document.createElement('video')` and never appended to the DOM you will need some always visible dummy container to append the video to, the bare minimum I've had working reliably is:
```css
.absolute-container {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}
.absolute-container > video, .absolute-container > canvas {
  opacity: 0.1%;
  width: 1px;
  height: 1px;
  position: relative;
}
```
With this you can append as many videos and canvases to the container as you want and thanks to the low opacity they will be close to invisible while not being throttled by the browser.

## Frame post-processing

I have a few options here to process the individual frames for example using ImageData, which [exposes the data as an array of pixels](https://devdocs.io/dom/imagedata/data), so you could easily 'borrow' some [VapourSynth](https://github.com/vapoursynth/vapoursynth) filters for this:
```js
  processFrame () {
    this.ctx.drawImage(this.video, 0, 0)
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height)
    const processed = this.doSomePostProcessing(imageData)
    this.ctx.putImageData(processed, 0, 0)
    this.callback = this.video.requestVideoFrameCallback(this.processFrame.bind(this))
  }
```
Or ImageBitmaps if you want to be fancy with some WebGL processing:
```js
  async processFrame () {
    this.ctx.drawImage(this.video, 0, 0)
    const bitmap = await globalThis.createImageBitmap(this.canvas)
    if (this.destroyed) return
    const processed = this.doSomeFancyPostProcessing(bitmap)
    this.ctx.putImageData(processed, 0, 0)
    this.callback = this.video.requestVideoFrameCallback(this.processFrame.bind(this))
  }
  ```
Bu I'll opt for something most people likely never heard of or even used and that is canvas filters, which don't require me to run any extra code during each frame, rather whenever the canvas mutates:
```js
  resize () {
    this.canvas.width = this.video.videoWidth
    this.canvas.height = this.video.videoHeight
    this.ctx.filter = 'contrast(1.5) saturate(200%)'
  }
```
This offers quite a few benefits, mainly that we don't handle the post processing but the browser engine, which leads to a respectable performance gain. These filters may seem basic, but the URL option allows for the use of [SVG filters](https://yoksel.github.io/svg-filters/#/) which are incredibly powerful, however not widely used, which means you won't find many ready results out there. Here's a REALLY good article to get you started: https://blog.logrocket.com/complete-guide-using-css-filters-svgs/

View Online: https://thaunknown.github.io/advanced-video-manipulation-js/01/
Browse source code: https://github.com/ThaUnknown/advanced-video-manipulation-js/tree/main/01