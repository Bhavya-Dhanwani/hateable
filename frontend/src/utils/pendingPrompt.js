// A prompt typed on the landing page survives the trip through signup.
const KEY = 'hateable:pending-prompt';

export function savePendingPrompt(value) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* storage blocked */
  }
}

export function takePendingPrompt() {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY));
    sessionStorage.removeItem(KEY);
    return value;
  } catch {
    return null;
  }
}

export function projectNameFrom(prompt) {
  const words = prompt
    .replace(/[^\w\s-]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .join(' ');
  return (words || 'Untitled project').replace(/^\w/, (c) => c.toUpperCase());
}
