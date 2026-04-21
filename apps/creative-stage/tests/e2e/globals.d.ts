interface Window {
  __testInjectScenes?: (scenes: Array<{ title: string; prompt: string; preset: string; duration: number }>) => void;
}
