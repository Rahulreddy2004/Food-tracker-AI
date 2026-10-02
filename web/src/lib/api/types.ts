import type { components } from "./schema";

type S = components["schemas"];

export type Macros = S["Macros"];
export type NormBox = S["NormBox"];
export type ScanResponse = S["ScanResponse"];
export type ScanItem = S["ScanItem"];
export type Prediction = S["Prediction"];
export type FoodHit = S["FoodHit"];
export type Product = S["Product"];
export type Meal = S["Meal"];
export type MealIn = S["MealIn"];
export type MealItemIn = S["MealItemIn"];
export type MealPatch = S["MealPatch"];
export type MealType = S["MealIn"]["mealType"];
export type DaySummary = S["DaySummary"];
export type PantryFood = S["PantryFood"];
export type PantryIn = S["PantryIn"];
export type PantryPatch = S["PantryPatch"];
export type Profile = S["Profile"];
export type ProfileIn = S["ProfileIn"];
export type Targets = S["Targets"];
export type Goal = NonNullable<S["ProfileIn"]["goal"]>;
export type ChatMessage = S["ChatMessage"];
export type MealInsight = S["MealInsight"];
