import { useEffect, useState } from 'react';
import { InputGroup, InputGroupInput, InputGroupAddon, InputGroupText } from '@/components/ui/input-group';

interface SuffixedNumberFieldProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix: string;
  onCommit: (v: number) => void;
}

export function SuffixedNumberField({
  value,
  min,
  max,
  step,
  suffix,
  onCommit,
}: SuffixedNumberFieldProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  return (
    <InputGroup className="w-auto">
      <InputGroupInput
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const num = Math.max(min, Math.min(max, parseInt(draft, 10) || value));
          setDraft(String(num));
          onCommit(num);
        }}
        className="w-10 flex-none text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <InputGroupAddon align="inline-end">
        <InputGroupText>{suffix}</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  );
}
