// ============================================================
// NÚCLEO ADAPTATIVO — TRI 2PL / CAT / BKT
// ------------------------------------------------------------
// Fórmulas psicométricas validadas que sustentan los resultados de la tesis.
// Antes de modificar, ten en cuenta:
//  - Estas fórmulas son deterministas y auditables (RNF-07). Alterarlas
//    cambia los resultados reportados en el documento.
//  - La IA se integra como CAPA externa (infrastructure/llm-item-prior.adapter),
//    NO reescribiendo este núcleo. Solo aporta semillas (a, b) en cold-start.
//  - Si en el futuro delegas un paso en IA, hazlo por COMPOSICIÓN y deja el
//    algoritmo como fallback verificable. Con AI_CALIBRATION_ENABLED=false el
//    sistema DEBE comportarse idéntico a hoy.
// Cambios aquí = decisión consciente y humana, no refactor automático.
// ============================================================

export * from './irt';
export * from './cat';
export * from './bkt';
export * from './grading';
export * from './calibration';
