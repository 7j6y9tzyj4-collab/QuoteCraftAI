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
  items:CalcItem[];
  client:string;
  project:string;
  locationMultiplier:number;
  notes:string;
  discountType?:"percent"|"amount";
  discountValue?:number;
  includeFinish?:boolean;
};

export type CalcAIItem={
  taskId:string;
  description:string;
  quantity:number;
  unit:Unit;
  difficulty:CalcDifficulty;
  note:string|null;
  confidence:number;
};
