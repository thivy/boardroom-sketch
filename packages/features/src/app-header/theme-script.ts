/** Inline script that runs before paint so the saved or system theme never flashes the wrong colours. */
export const themeScript = `try{var t=localStorage.getItem("theme")||(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}`;
