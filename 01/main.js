import 'https://esm.sh/rvfc-polyfill'

class PostProcessor {
  /**
   * @param  {HTMLVideoElement} video
   * @param  {HTMLCanvasElement} canvas
   */
  constructor (video, canvas) {
    this.destroyed = false
    this.video = video
    this.canvas = canvas
    video.addEventListener('resize', this.resize.bind(this))
    video.addEventListener('loadedmetadata', this.resize.bind(this))
    this.ctx = canvas.getContext('2d')
    this.resize()
    this.callback = video.requestVideoFrameCallback(this.processFrame.bind(this))
  }

  resize () {
    this.canvas.width = this.video.videoWidth
    this.canvas.height = this.video.videoHeight
    this.ctx.filter = 'contrast(1.5) saturate(200%)'
  }

  async processFrame () {
    this.ctx.drawImage(this.video, 0, 0)
    this.callback = this.video.requestVideoFrameCallback(this.processFrame.bind(this))
  }

  destroy () {
    this.destroyed = true
    this.video.cancelVideoFrameCallback(this.callback)
    this.video.removeEventListener('resize', this.resize)
    this.video.removeEventListener('loadedmetadata', this.resize)
  }
}

window.processor = new PostProcessor(document.querySelector('video'), document.querySelector('canvas'))
