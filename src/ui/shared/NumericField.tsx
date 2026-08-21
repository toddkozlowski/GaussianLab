import { useState } from 'react';
import type { ChangeEvent, InputHTMLAttributes, KeyboardEvent } from 'react';
import { stepNumericStringAtCaret } from './numericCaretStep';

function defaultFormat(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : '';
}

function defaultParse(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') {
    return null;
  }
  const numeric = Number(trimmed.replace(',', '.'));
  return Number.isFinite(numeric) ? numeric : null;
}

type PassthroughProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'onBlur' | 'onFocus' | 'onKeyDown' | 'type' | 'inputMode'
>;

export interface NumericFieldProps extends PassthroughProps {
  /** The committed external value. `null` renders blank (e.g. an "off-path" placeholder). */
  value: number | null;
  /** Fires once the user finalizes an edit - on blur, on Enter, or after an arrow-key step. */
  onCommit: (value: number) => void;
  /** Renders the committed value when the field isn't focused. Defaults to 3 decimal places. */
  format?: (value: number) => string;
  /**
   * Parses the field's raw text into a number when an edit is finalized.
   * Returning `null` discards the edit and reverts to the last committed value
   * (e.g. clearing the field and clicking away leaves the old value in place
   * instead of silently committing 0). Override to give special text - like an
   * empty string - its own numeric meaning (see the cavity radius "flat" case).
   */
  parse?: (text: string) => number | null;
}

/**
 * A numeric text input that only touches the DOM value while the user isn't
 * actively editing it.
 *
 * Earlier inputs here re-derived their `value` from the committed number on
 * every keystroke (dispatch -> reformat -> React resets the DOM value),
 * which yanks the caret to the end of the field after every character typed.
 * This keeps a local, unformatted draft of whatever the user is typing and
 * only reformats/commits once the edit is finalized (blur, Enter, or Escape
 * to cancel), so mid-edit text is never fought over.
 */
export function NumericField({
  value,
  onCommit,
  format = defaultFormat,
  parse = defaultParse,
  ...rest
}: NumericFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const displayValue = draft !== null ? draft : value === null ? '' : format(value);

  const commit = () => {
    if (draft === null) {
      return;
    }
    const parsed = parse(draft);
    if (parsed !== null) {
      onCommit(parsed);
    }
    setDraft(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(null);
      return;
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }

    event.preventDefault();
    const input = event.currentTarget;
    const caret = input.selectionStart ?? input.value.length;
    const direction = event.key === 'ArrowUp' ? 1 : -1;
    const next = stepNumericStringAtCaret(input.value, caret, direction);
    if (!next) {
      return;
    }
    const parsed = parse(next.value);
    if (parsed === null) {
      return;
    }

    setDraft(next.value);
    onCommit(parsed);
    window.requestAnimationFrame(() => {
      try {
        input.setSelectionRange(next.caret, next.caret);
      } catch {
        // Selection APIs may not be available for all browsers/input modes.
      }
    });
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      value={displayValue}
      onFocus={() => setDraft(value === null ? '' : format(value))}
      onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
    />
  );
}
