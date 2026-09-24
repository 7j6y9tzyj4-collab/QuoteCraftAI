import type {CalcTask} from "./calcTypes";
import {catalog} from "./catalog";

/**
 * calcDefaults
 * ------------
 * Тепер це тонкий перехідник: самі дані живуть в одному місці — lib/catalog.ts.
 * Раніше тут лежав власний каталог калькулятора, паралельний до lib/defaults.ts,
 * і та сама робота мала дві різні ціни залежно від вкладки. Файл лишається лише
 * заради звичного імпорту; нові позиції додавай у catalog.ts.
 */
export const calcDefaults:CalcTask[]=catalog.map(t=>({
  id:t.id,
  category:t.category,
  name:t.name,
  unit:t.unit,
  laborRate:t.laborRate,
  materialRate:t.materialRate,
  finishRate:t.finishRate||0,
  suppliesPct:t.suppliesPct,
  suppliesFixed:t.suppliesFixed,
  minPrice:t.minPrice,
  difficultyMultipliers:t.difficultyMultipliers,
  lowMult:t.lowMult,
  highMult:t.highMult,
  notes:t.notes,
  source:t.source
}));
