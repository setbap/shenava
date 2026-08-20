class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0]
    if (channel && channel.length > 0) {
      this.port.postMessage(channel.slice())
    }
    return true
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor)
