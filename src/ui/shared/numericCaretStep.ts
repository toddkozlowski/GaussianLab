import type React from 'react';

interface StepResult {
  value: string;
  caret: number;
}

function toNumber(text: string): number | null {
  const numeric = Number(text.replace(',', '.'));
  return Number.isFinite(numeric) ? numeric : null;
}

function findDecimalSeparator(text: string): { index: number; char: '.' | ',' } {
  const comma = text.lastIndexOf(',');
  const dot = text.lastIndexOf('.');
  if (comma > dot) return { index: comma, char: ',' };
  return { index: dot, char: '.' };
}

function findTargetDigitIndex(text: string, caret: number): number {
  for (let i = caret; i < text.length; i += 1) {
    if (text[i] >= '0' && text[i] <= '9') return i;
  }
  for (let i = Math.min(caret - 1, text.length - 1); i >= 0; i -= 1) {
    if (text[i] >= '0' && text[i] <= '9') return i;
  }
  return -1;
}

function formatWithOriginalSeparator(value: number, decimals: number, separator: '.' | ','): string {
  const fixed = value.toFixed(Math.max(0, decimals));
  if (separator === ',') {
    return fixed.replace('.', ',');
  }
  return fixed;
}

export function stepNumericStringAtCaret(rawText: string, caret: number, direction: 1 | -1): StepResult | null {
  const text = rawText.trim();
  if (!text) {
    return null;
  }

  const numberValue = toNumber(text);
  if (numberValue === null) {
    return null;
  }

  const { index: decimalIndex, char: separator } = findDecimalSeparator(text);
  const decimals = decimalIndex >= 0 ? text.length - decimalIndex - 1 : 0;
  const digitIndex = findTargetDigitIndex(text, caret);
  if (digitIndex < 0) {
    return null;
  }

  let exponent = 0;
  if (decimalIndex >= 0) {
    if (digitIndex < decimalIndex) {
      exponent = decimalIndex - digitIndex - 1;
    } else if (digitIndex > decimalIndex) {
      exponent = -(digitIndex - decimalIndex);
    }
  } else {
    exponent = text.length - digitIndex - 1;
  }

  const step = 10 ** exponent;
  const nextValue = numberValue + direction * step;
  const nextText = formatWithOriginalSeparator(nextValue, decimals, separator);
  const nextCaret = Math.min(caret, nextText.length);
  return { value: nextText, caret: nextCaret };
}

export function handleCaretStepKeyDown(
  event: React.KeyboardEvent<HTMLInputElement>,
  onNumericValue: (value: number) => void,
): void {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
    return;
  }

  event.preventDefault();
  const input = event.currentTarget;
  const caret = input.selectionStart ?? input.value.length;
  const direction: 1 | -1 = event.key === 'ArrowUp' ? 1 : -1;
  const next = stepNumericStringAtCaret(input.value, caret, direction);
  if (!next) {
    return;
  }

  const value = toNumber(next.value);
  if (value === null) {
    return;
  }

  onNumericValue(value);

  window.requestAnimationFrame(() => {
    try {
      input.setSelectionRange(next.caret, next.caret);
    } catch {
      // Selection APIs may not be available for all browsers/input modes.
    }
  });
}
