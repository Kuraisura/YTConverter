declare module 'fluent-ffmpeg' {
  interface FfmpegCommand {
    output(path: string): FfmpegCommand;
    audioBitrate(bitrate: string): FfmpegCommand;
    audioCodec(codec: string): FfmpegCommand;
    audioChannels(channels: number): FfmpegCommand;
    audioFrequency(freq: number): FfmpegCommand;
    videoCodec(codec: string): FfmpegCommand;
    videoFilter(filter: string): FfmpegCommand;
    preset(preset: string): FfmpegCommand;
    outputOptions(...options: string[]): FfmpegCommand;
    outputOptions(options: string[]): FfmpegCommand;
    format(fmt: string): FfmpegCommand;
    on(event: string, callback: (data?: any) => void): FfmpegCommand;
    run(): void;
  }

  function ffmpeg(input: string | NodeJS.ReadableStream): FfmpegCommand;

  export = ffmpeg;
}
