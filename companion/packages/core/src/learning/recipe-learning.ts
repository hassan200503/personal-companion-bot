/**
 * Recipe Learning
 *
 * Stores and retrieves successful automation patterns (recipes)
 * learned from episode consolidation. Recipes are tool sequences
 * that can be reused for similar contexts.
 */

export interface Recipe {
  id: string;
  name: string;
  description: string;
  toolSequence: string[];
  successRate: number;
  lastUsed: string;
  createdAt: string;
  approved: boolean;
  contextHints: string[];
}

export interface RecipeStore {
  saveRecipe(recipe: Omit<Recipe, 'id' | 'createdAt' | 'successRate' | 'lastUsed'>): Recipe;
  approveRecipe(recipeId: string): void;
  rejectRecipe(recipeId: string): void;
  getRecipe(recipeId: string): Recipe | null;
  listRecipes(approvedOnly?: boolean): Recipe[];
  findRecipesByContext(context: string): Recipe[];
  recordUsage(recipeId: string, success: boolean): void;
  deleteRecipe(recipeId: string): void;
}

export class InMemoryRecipeStore implements RecipeStore {
  private recipes = new Map<string, Recipe>();

  saveRecipe(recipe: Omit<Recipe, 'id' | 'createdAt' | 'successRate' | 'lastUsed'>): Recipe {
    const id = `recipe_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();
    
    const newRecipe: Recipe = {
      id,
      ...recipe,
      createdAt: now,
      lastUsed: now,
      successRate: 0,
    };
    
    this.recipes.set(id, newRecipe);
    return newRecipe;
  }

  approveRecipe(recipeId: string): void {
    const recipe = this.recipes.get(recipeId);
    if (recipe) {
      recipe.approved = true;
    }
  }

  rejectRecipe(recipeId: string): void {
    const recipe = this.recipes.get(recipeId);
    if (recipe) {
      recipe.approved = false;
    }
  }

  getRecipe(recipeId: string): Recipe | null {
    return this.recipes.get(recipeId) || null;
  }

  listRecipes(approvedOnly = false): Recipe[] {
    const all = Array.from(this.recipes.values());
    if (approvedOnly) {
      return all.filter(r => r.approved);
    }
    return all;
  }

  findRecipesByContext(context: string): Recipe[] {
    const lowerContext = context.toLowerCase();
    return this.listRecipes(true).filter(recipe =>
      recipe.contextHints.some(hint => lowerContext.includes(hint.toLowerCase()))
    );
  }

  recordUsage(recipeId: string, success: boolean): void {
    const recipe = this.recipes.get(recipeId);
    if (!recipe) return;

    recipe.lastUsed = new Date().toISOString();
    
    // Update success rate with exponential moving average
    const alpha = 0.3; // Weight for new observation
    const newRate = success ? 1 : 0;
    recipe.successRate = alpha * newRate + (1 - alpha) * recipe.successRate;
  }

  deleteRecipe(recipeId: string): void {
    this.recipes.delete(recipeId);
  }

  /**
   * Clear all recipes (for testing)
   */
  clear(): void {
    this.recipes.clear();
  }
}

/**
 * Recipe Suggester
 *
 * Suggests appropriate recipes based on current context
 * and conversation history.
 */
export class RecipeSuggester {
  private store: RecipeStore;

  constructor(store: RecipeStore) {
    this.store = store;
  }

  /**
   * Suggest recipes for a given context
   */
  suggest(context: string, maxSuggestions = 3): Recipe[] {
    const candidates = this.store.findRecipesByContext(context);
    
    // Sort by success rate and recency
    const sorted = candidates.sort((a, b) => {
      // Prefer higher success rate
      if (b.successRate !== a.successRate) {
        return b.successRate - a.successRate;
      }
      // Then prefer more recently used
      return b.lastUsed.localeCompare(a.lastUsed);
    });

    return sorted.slice(0, maxSuggestions);
  }

  /**
   * Extract context hints from user message
   */
  extractContextHints(message: string): string[] {
    const hints: string[] = [];
    const lowerMessage = message.toLowerCase();

    // Common automation contexts
    const contextKeywords = [
      { keyword: 'open', hint: 'opening apps' },
      { keyword: 'play', hint: 'media playback' },
      { keyword: 'send', hint: 'messaging' },
      { keyword: 'email', hint: 'email' },
      { keyword: 'calendar', hint: 'scheduling' },
      { keyword: 'notepad', hint: 'notes' },
      { keyword: 'call', hint: 'calling' },
      { keyword: 'speak', hint: 'voice output' },
    ];

    for (const { keyword, hint } of contextKeywords) {
      if (lowerMessage.includes(keyword)) {
        hints.push(hint);
      }
    }

    return hints;
  }
}
