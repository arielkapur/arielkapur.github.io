(() => {
  "use strict";
  const filters = [...document.querySelectorAll("[data-filter]")];
  const cards = [...document.querySelectorAll("[data-category]")];
  const empty = document.getElementById("filter-empty");
  const applyFilter = (category) => {
    let visible = 0;
    cards.forEach((card) => {
      const show = category === "all" || card.dataset.category === category;
      card.hidden = !show;
      if (show) visible++;
    });
    filters.forEach((button) => {
      const selected = button.dataset.filter === category;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    if (empty) empty.hidden = visible !== 0;
  };
  filters.forEach((button) => button.addEventListener("click", () => applyFilter(button.dataset.filter)));
  const contrast = document.getElementById("theme-toggle");
  try {
    if (localStorage.getItem("ak-archive-contrast") === "dark") document.body.classList.add("dark");
  } catch (_) {}
  const updateContrast = () => {
    if (contrast) contrast.setAttribute("aria-pressed", String(document.body.classList.contains("dark")));
  };
  updateContrast();
  if (contrast) contrast.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    updateContrast();
    try { localStorage.setItem("ak-archive-contrast", document.body.classList.contains("dark") ? "dark" : "light"); } catch (_) {}
  });
  const signals = [
    "[ SIGNAL FOUND IN AN ABANDONED ORBIT ]",
    "[ A NEW WORLD HAS FAILED SUCCESSFULLY ]",
    "[ THIS IS AN EXPERIMENT, NOT AN ANSWER ]",
    "[ THE MACHINE DREAMS IN DIFFERENTIAL EQUATIONS ]",
    "[ SOMEBODY LEFT THE UNIVERSE RUNNING ]",
    "[ NOTHING STAYS FINISHED FOR VERY LONG ]",
    "[ UNKNOWN OBJECT: FRIENDLY, PROBABLY ]",
    "[ SOMEWHERE, A SMALL GAME IS STILL RUNNING ]"
  ];
  const transmit = document.getElementById("signal-button");
  const output = document.getElementById("signal-output");
  let lastSignal = -1;
  if (transmit && output) transmit.addEventListener("click", () => {
    let index = Math.floor(Math.random() * signals.length);
    if (index === lastSignal) index = (index + 1) % signals.length;
    lastSignal = index;
    output.textContent = signals[index];
  });
  const year = document.getElementById("current-year");
  if (year) year.textContent = String(new Date().getFullYear());
})();