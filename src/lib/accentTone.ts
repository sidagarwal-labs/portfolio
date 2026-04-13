export function getAccentTone(accent: string) {
  switch (accent) {
    case "#00d4ff":
      return "data";
    case "#00e68a":
    case "#5df0be":
      return "profit";
    case "#ffd700":
    case "#ffb36b":
      return "gold";
    case "#ff6b35":
    case "#ff8b5d":
      return "fire";
    case "#ff4757":
    case "#ff6b88":
      return "alert";
    case "#a855f7":
      return "neural";
    case "#e8531e":
      return "fire";
    case "#c4d8ff":
      return "ice";
    default:
      return "data";
  }
}
