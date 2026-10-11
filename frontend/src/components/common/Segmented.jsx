// Segmented control (tabs / filters). options: [{ value, label }].
export default function Segmented({ options, value, onChange, label, style }) {
  return (
    <div className="seg" role="tablist" aria-label={label} style={style}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
