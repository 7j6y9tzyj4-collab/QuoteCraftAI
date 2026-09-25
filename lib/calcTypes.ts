import type {Unit} from "./types";

export type CalcDifficulty="basic"|"standard"|"difficult";

export type CalcTask={
  id:string;
  category:string;
  name:string;
  unit:Unit;
  laborRate:number;
  materialRate:number;
  finishRate?:number;
  suppliesPct:number;
  suppliesFixed:number;
  minPrice:number;
  difficultyMultipliers:{basic:number;standard:number;difficult:number};
  lowMult:number;
  highMult:number;
  notes:string;
  source:string;
};

export type CalcItem={
  id:string;
  taskId:string;
  name:string;
  category:string;
  unit:Unit;
  quantity:number;
  difficulty:CalcDifficulty;
  laborRate:number;
  materialRate:number;
  finishRate?:number;
  suppliesPct:number;
  suppliesFixed:number;
  minPrice:number;
  difficultyMultipliers:{basic:number;standard:number;difficult:number};
  lowMult:number;
  highMult:number;
  notes:string;
  note?:string;
  confidence?:number;
  /** опційна позиція: показується окремо, в загальну суму не входить */
  optional?:boolean;
  /** ставку праці введено вручну в цьому рядку (прайс не змінюється) */
  laborOwn?:boolean;
  /** оздоблення змінене вручну в цьому рядку */
  finishOwn?:boolean;
};

export type CalcTotals={
  labor:number;
  materials:number;
  supplies:number;
  finish:number;
  lineTotal:number;
  low:number;
  high:number;
};

export type CalcDraft={
  /** id збереженого естімейту калькулятора (якщо збережений) */
  savedId?:string;
  shareToken?:string;
  items:CalcItem[];
  client:string;
  project:string;
  locationMultiplier:number;
  notes:string;
  discountType?:"percent"|"amount";
  discountValue?:number;
  includeFinish?:boolean;
};

/** збережений естімейт з калькулятора */
export type SavedCalc=CalcDraft&{id:string;updatedAt:string;total:number};

export type CalcAIItem={
  taskId:string;
  description:string;
  quantity:number;
  unit:Unit;
  difficulty:CalcDifficulty;
  note:string|null;
  confidence:number;
  /** ціна праці, яку власник назвав у тексті */
  statedPrice?:number|null;
  statedPriceType?:"per_unit"|"total"|null;
  /** робота входить у суму, названу для іншого рядка — праця 0 */
  includedInStated?:boolean;
  /** власник сказав «optional / if needed / якщо клієнт захоче» */
  optional?:boolean|null;
};
