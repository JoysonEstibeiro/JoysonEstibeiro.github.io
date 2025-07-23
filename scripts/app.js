function background() {
  if (this.scrollY > this.innerHeight / 2){
    document.body.classList.add("background_active");
  } else {
    document.body.classList.remove("background_active");
  }
}

window.addEventListener("scroll", background);
