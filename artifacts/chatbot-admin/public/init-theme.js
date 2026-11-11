try {
  var t = localStorage.getItem("mc-theme");
  if (t === "light") {} else {
    document.documentElement.classList.add("dark");
  }
} catch (e) {
  document.documentElement.classList.add("dark");
}
try {
  var l = localStorage.getItem("mc-lang");
  if (l === "ar") {
    document.documentElement.dir = "rtl";
    document.documentElement.lang = "ar";
  } else {
    document.documentElement.dir = "ltr";
    document.documentElement.lang = "en";
  }
} catch (e) {}
