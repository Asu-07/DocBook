import { Injectable } from '@angular/core';

/**
 * Browser-side face recognition. All ML runs locally in the user's browser via
 * @vladmandic/face-api (TensorFlow.js). Models are served from /face-models/ in
 * the public folder and loaded lazily on first use — no API keys, no third-party
 * calls. The 128-float descriptor produced here is what gets POSTed to the backend.
 */
@Injectable({ providedIn: 'root' })
export class FaceRecognitionService {
  private faceApi: any | null = null;
  private modelsReady = false;
  private loadPromise: Promise<void> | null = null;

  /** Lazy-import the heavy face-api bundle and load its models. Idempotent. */
  async ensureReady(): Promise<void> {
    if (this.modelsReady) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      const mod = await import('@vladmandic/face-api');
      this.faceApi = mod;
      const url = '/face-models';
      await Promise.all([
        mod.nets.tinyFaceDetector.loadFromUri(url),
        mod.nets.faceLandmark68Net.loadFromUri(url),
        mod.nets.faceRecognitionNet.loadFromUri(url),
      ]);
      this.modelsReady = true;
    })();

    try {
      await this.loadPromise;
    } catch (err) {
      this.loadPromise = null;
      throw err;
    }
  }

  /**
   * Run face detection + landmark + descriptor on a video frame.
   * Returns the 128-dim descriptor or null if no face was detected.
   */
  async detectDescriptor(video: HTMLVideoElement): Promise<Float32Array | null> {
    if (!this.modelsReady || !this.faceApi) {
      throw new Error('Face recognition models not loaded yet');
    }
    const result = await this.faceApi
      .detectSingleFace(video, new this.faceApi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!result || !result.descriptor) return null;
    return result.descriptor as Float32Array;
  }

  /** Convert a Float32Array to a regular number[] for JSON-serializable transport. */
  descriptorToArray(d: Float32Array): number[] {
    return Array.from(d);
  }
}
