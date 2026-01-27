import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./styles.css";

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.mount("#app");

// Disable native context menu globally (we use custom menus)
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});
