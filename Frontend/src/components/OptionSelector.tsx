import "./OptionSelector.css"

type Option = {
  label: string
  value: string
  emoji?: string
  description?: string
}

type Props = {
  title: string
  options: Option[]
  selected: string | string[]
  onSelect: (value: string) => void
  multi?: boolean
}

export default function OptionSelector({
  title,
  options,
  selected,
  onSelect,
  multi = false
}: Props) {

  const isSelected = (value: string) => {
    if (Array.isArray(selected)) {
      return selected.includes(value)
    }
    return selected === value
  }

  return (

    <div className="option-group">

      <h3 className="option-title">{title}</h3>

      <div className="option-container">

        {options.map((opt) => (

          <button
            key={opt.value}
            type="button"
            className={`option-card ${isSelected(opt.value) ? "active" : ""}`}
            onClick={() => onSelect(opt.value)}
          >
            {opt.emoji && <span className="option-emoji">{opt.emoji}</span>}
            <span className="option-label">{opt.label}</span>
            {opt.description && <span className="option-description">{opt.description}</span>}
          </button>

        ))}

      </div>

    </div>

  )
}
