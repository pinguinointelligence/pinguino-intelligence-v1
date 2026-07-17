/**
 * §8.3 „Nie widzę mojej maszyny” — the plain-language behavior question.
 * Four answers about what the machine DOES; never the words "re-spin",
 * "kompresor" or "frozen bowl". The dispenser answer routes to the honest
 * unsupported state at the orchestrator level (never bent onto Ninja Swirl).
 */
import { MACHINE_BEHAVIOR_ANSWERS, type MachineBehaviorAnswer } from '@/features/machine-catalog';
import { SelectableCard } from '@/features/customer-shell/ui/SelectableCard';
import { TouchButton } from '@/features/customer-shell/ui/TouchButton';
import { machineOnboardingCopy as copy } from '../machineOnboardingCopy';

interface MachineBehaviorQuestionProps {
  onPick: (answer: MachineBehaviorAnswer) => void;
  onBack: () => void;
}

export function MachineBehaviorQuestion({ onPick, onBack }: MachineBehaviorQuestionProps) {
  return (
    <div>
      <div className="space-y-3" role="radiogroup" aria-label={copy.behavior.title}>
        {MACHINE_BEHAVIOR_ANSWERS.map((answer) => (
          <SelectableCard
            key={answer.id}
            title={answer.answer}
            description={answer.helper}
            onSelect={() => onPick(answer)}
          />
        ))}
      </div>
      <div className="mt-6">
        <TouchButton variant="quiet" onClick={onBack}>
          {copy.behavior.back}
        </TouchButton>
      </div>
    </div>
  );
}
