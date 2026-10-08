# Rúbricas · ProfeAlbertoD

Aplicación web estática para convertir rúbricas CSV en una interfaz de evaluación interactiva.

## Uso
1. Abre la web.
2. Pega el CSV de la rúbrica.
3. Pulsa **Cargar rúbrica**.
4. Selecciona el nivel conseguido en cada pregunta.
5. La puntuación y el progreso se calculan automáticamente.

## Formato CSV
Columnas esperadas:
- Criterio
- Pregunta
- Aspecto evaluado
- Nivel insuficiente (0%)
- Puntos 0%
- Nivel básico (25%)
- Puntos 25%
- Nivel adecuado (50%)
- Puntos 50%
- Nivel notable (75%)
- Puntos 75%
- Nivel excelente (100%)
- Puntos 100%
- Máximo

El separador recomendado es `;\`.

## GitHub Pages
Activa GitHub Pages usando la rama `main` y la carpeta raíz.

No necesita servidor ni base de datos. La evaluación se conserva localmente en el navegador mediante `localStorage`.
