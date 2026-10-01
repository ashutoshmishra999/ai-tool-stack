const filterButtons = document.querySelectorAll(".filter-button");
const updateCards = document.querySelectorAll(".update-card");

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const filter = button.dataset.filter;

    filterButtons.forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");

    updateCards.forEach((card) => {
      const shouldShow = filter === "all" || card.dataset.category === filter;
      card.classList.toggle("is-hidden", !shouldShow);
    });
  });
});

const waitlistForm = document.querySelector(".waitlist-form");

waitlistForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const button = waitlistForm.querySelector("button");
  const originalText = button.textContent;

  button.textContent = "Access requested";
  button.disabled = true;

  window.setTimeout(() => {
    button.textContent = originalText;
    button.disabled = false;
  }, 2400);
});
