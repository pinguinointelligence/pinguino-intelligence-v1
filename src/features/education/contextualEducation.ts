import type { RecipeInput } from '@/engine';
import { educationCopy } from '@/copy/education.pl';

export type EducationAudience = 'home' | 'pro';
export type EducationLessonId = 'ingredients' | 'sugar' | 'micro' | 'process' | 'machine';

export interface ContextualEducationPrompt {
  id: string;
  title: string;
  note: string;
  lessonId: EducationLessonId;
  focus?: string;
}

const hasIngredient = (
  input: RecipeInput,
  predicate: (item: RecipeInput['items'][number]) => boolean,
) => input.items.some(predicate);

export function contextualEducationPrompts(input: RecipeInput): ContextualEducationPrompt[] {
  const prompts: ContextualEducationPrompt[] = [];
  const hasFruit = hasIngredient(input, (item) => item.ingredient.category === 'fruit');
  const hasStabilizer = hasIngredient(input, (item) => item.ingredient.category === 'stabilizer');
  const hasInulin = hasIngredient(input, (item) => {
    const identity =
      `${item.ingredient.id} ${item.ingredient.canonical_ingredient_id ?? ''}`.toLowerCase();
    return identity.includes('inulin');
  });
  const hasDairy = hasIngredient(input, (item) => item.ingredient.category === 'dairy');
  const hasSugar = hasIngredient(
    input,
    (item) =>
      item.ingredient.category === 'sugar' ||
      item.ingredient.composition.sugar_percent > 0 ||
      item.ingredient.composition.lactose_percent > 0,
  );

  if (hasFruit) {
    prompts.push({
      id: 'fruit',
      ...educationCopy.prompts.fruit,
      lessonId: 'ingredients',
      focus: 'mango',
    });
  }
  if (hasSugar) {
    prompts.push({ id: 'sugar', ...educationCopy.prompts.sugar, lessonId: 'sugar' });
  }
  if (hasStabilizer && hasInulin) {
    prompts.push({ id: 'micro', ...educationCopy.prompts.micro, lessonId: 'micro' });
  } else if (hasStabilizer) {
    prompts.push({
      id: 'stabilizer',
      ...educationCopy.prompts.stabilizer,
      lessonId: 'micro',
      focus: 'stabilizer',
    });
  }
  if (hasInulin && !hasStabilizer) {
    prompts.push({
      id: 'inulin',
      ...educationCopy.prompts.inulin,
      lessonId: 'micro',
      focus: 'inulin',
    });
  }
  if (hasDairy) {
    prompts.push({
      id: 'dairy',
      ...educationCopy.prompts.dairy,
      lessonId: 'ingredients',
      focus: 'milk',
    });
  }
  prompts.push({ id: 'process', ...educationCopy.prompts.process, lessonId: 'process' });
  if (prompts.length < 2) {
    prompts.push({ id: 'temperature', ...educationCopy.prompts.temperature, lessonId: 'sugar' });
  }

  return prompts.slice(0, 3);
}

export function topLevelEducationOrder(audience: EducationAudience): readonly EducationLessonId[] {
  return audience === 'home'
    ? ['process', 'ingredients', 'sugar']
    : ['ingredients', 'sugar', 'process'];
}
