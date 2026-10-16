(function (global) {
  "use strict";
  let active = null;
  const EYEDROPPER_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"'
    + ' stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/>'
    + '<path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/></svg>';

  function place(entry) {
    const { panel, trigger } = entry;
    const rect = trigger.getBoundingClientRect();
    const width = document.documentElement.clientWidth;
    panel.style.left = "0px";
    panel.style.maxHeight = `${Math.max(100, innerHeight - 8)}px`;
    panel.style.left = `${Math.max(4, Math.min(rect.left, width - panel.offsetWidth - 4))}px`;
    const below = rect.bottom + 6;
    const top = below + panel.offsetHeight <= innerHeight - 4 ? below : rect.top - panel.offsetHeight - 6;
    panel.style.top = `${Math.max(4, Math.min(top, innerHeight - panel.offsetHeight - 4))}px`;
  }

  function close() {
    if (!active) return;
    const entry = active;
    active = null;
    entry.commit();
    entry.panel.hidden = true;
    entry.trigger.setAttribute("aria-expanded", "false");
  }

  function attach({ input, trigger, panel, defaultColor, reset, label, onCommit }) {
    panel ??= document.createElement("div");
    if (!panel.id) panel.id = `${input.id}-panel`;
    panel.classList.add("trade-color-panel");
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", label());
    document.body.append(panel);
    input.type = "text";
    input.hidden = true;
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-controls", panel.id);
    trigger.setAttribute("aria-expanded", "false");
    reset ??= document.createElement("button");
    reset.type = "button";
    reset.id ||= `${input.id}-reset`;
    reset.className = "trade-color-reset";
    reset.dataset.i18n = "order_color.reset";
    const title = document.createElement("div");
    title.className = "trade-color-title";
    panel.prepend(title);
    const mount = document.createElement("span");
    panel.append(mount);
    let picker = null, dirty = false;
    const entry = { input, trigger, panel, commit() {
      if (!dirty) return;
      dirty = false;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      onCommit?.();
    } };
    const apply = (value) => {
      if (input.value === value) return;
      input.value = value;
      dirty = true;
      trigger.style.setProperty("--swatch", value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const eyedropper = typeof global.EyeDropper === "function" ? document.createElement("button") : null;
    if (eyedropper) {
      eyedropper.type = "button";
      eyedropper.id = `${input.id}-eyedropper`;
      eyedropper.className = "trade-color-eyedropper";
      eyedropper.innerHTML = EYEDROPPER_ICON;
      eyedropper.addEventListener("click", async () => {
        let picked;
        try {
          picked = await new global.EyeDropper().open();
        } catch {
          return;
        }
        const rgb = /^#[0-9a-f]{6}$/i.test(picked?.sRGBHex ?? "") ? picked.sRGBHex.toLowerCase() : null;
        if (!rgb || !picker) return;
        const alpha = input.value.length === 9 ? input.value.slice(7).toLowerCase() : "";
        const value = alpha && alpha !== "ff" ? rgb + alpha : rgb;
        picker.setColor(value, true);
        apply(value);
        entry.commit();
      });
    }
    const labelEyedropper = () => {
      if (!eyedropper) return;
      const text = global.TradeVizColorText?.("order_color.eyedropper") ?? "Pick a colour from the screen";
      eyedropper.title = text;
      eyedropper.setAttribute("aria-label", text);
    };
    trigger.addEventListener("click", () => {
      const wasOpen = active === entry;
      close();
      if (wasOpen) return;
      title.textContent = label();
      panel.setAttribute("aria-label", label());
      reset.textContent = global.TradeVizColorText?.() ?? "Reset to default";
      labelEyedropper();
      panel.hidden = false;
      if (!picker) {
        picker = global.Pickr.create({ el: mount, container: panel, theme: "nano", inline: true,
          useAsButton: true, showAlways: true, comparison: false, default: input.value,
          defaultRepresentation: "RGBA",
          autoReposition: false, closeOnScroll: false, closeWithKey: "",
          components: { preview: true, opacity: true, hue: true,
            interaction: { input: true, hex: true, rgba: true } } });
        picker.on("change", (color) => {
          const hex = color.toHEXA().toString().toLowerCase();
          apply(hex.length === 9 && hex.endsWith("ff") ? hex.slice(0, 7) : hex);
        });
        picker.on("changestop", entry.commit);
        const interaction = picker.getRoot().app.querySelector(".pcr-interaction");
        interaction.insertBefore(interaction.querySelector('[value="RGBA"]'), interaction.querySelector('[value="HEXA"]'));
        interaction.append(reset);
        if (eyedropper) picker.getRoot().app.querySelector(".pcr-selection").prepend(eyedropper);
      }
      picker.setColor(input.value, true);
      picker.setColorRepresentation("RGBA");
      active = entry;
      trigger.setAttribute("aria-expanded", "true");
      place(entry);
    });
    reset.addEventListener("click", () => {
      apply(defaultColor);
      dirty = true;
      picker?.setColor(defaultColor, true);
      close();
      trigger.focus();
    });
    input.addEventListener("input", () => trigger.style.setProperty("--swatch", input.value));
    return entry;
  }

  document.addEventListener("pointerdown", (event) => {
    if (active && !active.panel.contains(event.target) && !active.trigger.contains(event.target)) close();
  }, true);
  global.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !active) return;
    const trigger = active.trigger;
    event.preventDefault();
    event.stopImmediatePropagation();
    close();
    trigger.focus();
  }, true);
  global.addEventListener("resize", () => active && place(active));
  global.addEventListener("scroll", () => active && place(active), true);
  global.TradeVizColors = Object.freeze({ attach, close });
})(globalThis);
