// 依指標目錄產生數字輸入欄位：新增一項指標時，輸入欄位會自動出現。

// 例如「熱量（大卡）」。
export function measureLabel(measure) {
  return `${measure.name}（${measure.unit}）`;
}

// 在 container 裡為每一項指標產生一個輸入欄位（input 的 name 就是指標的 key）。
export function renderMeasureInputs(container, measures, labelFor) {
  container.replaceChildren(...measures.map((measure) => {
    const label = document.createElement("label");
    label.className = "field";
    const span = document.createElement("span");
    span.textContent = labelFor(measure);
    const input = document.createElement("input");
    input.name = measure.key;
    input.type = "number";
    input.inputMode = "decimal";
    input.min = "0";
    input.step = "any";
    label.append(span, input);
    return label;
  }));
}
