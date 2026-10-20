import { LocaleType, merge, Univer, UniverInstanceType } from "@univerjs/core";
import { UniverRenderEnginePlugin } from "@univerjs/engine-render";
import { UniverFormulaEnginePlugin } from "@univerjs/engine-formula";
import { UniverUIPlugin } from "@univerjs/ui";
import { UniverDocsPlugin } from "@univerjs/docs";
import { UniverDocsUIPlugin } from "@univerjs/docs-ui";
import { UniverSlidesPlugin, DEFAULT_SLIDE, PageElementType, PageType, BasicShapes } from "@univerjs/slides";
import { UniverSlidesUIPlugin } from "@univerjs/slides-ui";
import designEnUS from "@univerjs/design/locale/en-US";
import uiEnUS from "@univerjs/ui/locale/en-US";
import docsUIEnUS from "@univerjs/docs-ui/locale/en-US";
import slidesUIEnUS from "@univerjs/slides-ui/locale/en-US";

const univer = new Univer({
  locale: LocaleType.EN_US,
  locales: { [LocaleType.EN_US]: merge({}, designEnUS, uiEnUS, docsUIEnUS, slidesUIEnUS) },
});
univer.registerPlugin(UniverRenderEnginePlugin);
univer.registerPlugin(UniverFormulaEnginePlugin);
univer.registerPlugin(UniverUIPlugin, { container: "app" });
univer.registerPlugin(UniverDocsPlugin);
univer.registerPlugin(UniverDocsUIPlugin);
univer.registerPlugin(UniverSlidesPlugin);
univer.registerPlugin(UniverSlidesUIPlugin);
const element = (id, z, left, top, width, height, rest) => ({ id, zIndex: z, left, top, width, height, title: id, description: "", ...rest });
const SAMPLE = {
  id: "sample", title: "Sample", pageSize: { width: 960, height: 540 },
  body: {
    pageOrder: ["p1", "p2"],
    pages: {
      p1: {
        id: "p1", pageType: PageType.SLIDE, zIndex: 1, title: "Title", description: "", pageBackgroundFill: { rgb: "rgb(255,255,255)" },
        pageElements: {
          t1: element("t1", 10, 80, 80, 800, 80, { type: PageElementType.TEXT, richText: { text: "Quarterly report", fs: 40, cl: { rgb: "rgb(31,56,100)" }, bl: 1 } }),
          t2: element("t2", 11, 80, 200, 800, 60, { type: PageElementType.TEXT, richText: { text: "Second line, smaller", fs: 24, cl: { rgb: "rgb(80,80,80)" } } }),
          s1: element("s1", 12, 80, 320, 200, 120, { type: PageElementType.SHAPE, shape: { shapeType: BasicShapes.Rect, text: "", shapeProperties: { shapeBackgroundFill: { rgb: "rgb(68,114,196)" } } } }),
        },
      },
      p2: {
        id: "p2", pageType: PageType.SLIDE, zIndex: 2, title: "Second", description: "", pageBackgroundFill: { rgb: "rgb(240,240,240)" },
        pageElements: { t3: element("t3", 10, 80, 80, 800, 80, { type: PageElementType.TEXT, richText: { text: "Slide 2", fs: 36, cl: { rgb: "rgb(0,0,0)" } } }) },
      },
    },
  },
};
univer.createUnit(UniverInstanceType.UNIVER_SLIDE, SAMPLE);

window.S7 = { univer, DEFAULT_SLIDE, PageElementType, PageType, BasicShapes };
document.getElementById("status").textContent = "ready";
document.body.dataset.ready = "true";
