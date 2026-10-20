/*
 * Writes the deck model (see pptx-import.js) as PPTX with PptxGenJS (global `PptxGenJS`,
 * vendor/pptxgen.bundle.js). ES module. PptxGenJS has no slide transitions or animations: they are added to the slide XML
 * of its output afterwards (fflate).
 */
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";

const PX_PER_INCH = 96;
const inch = (px) => px / PX_PER_INCH;
const hex = (c) => (c ? c.replace("#", "").toUpperCase() : undefined);
// deck geometry -> PptxGenJS shape name (preset names are the same as in OOXML)
const SHAPES = {
  rect: "rect", roundRect: "roundRect", ellipse: "ellipse", triangle: "triangle", rtTriangle: "rtTriangle",
  diamond: "diamond", parallelogram: "parallelogram", trapezoid: "trapezoid", pentagon: "pentagon", hexagon: "hexagon",
  rightArrow: "rightArrow", leftArrow: "leftArrow", star5: "star5", line: "line", straightConnector1: "line",
};
const VALIGN = { t: "top", ctr: "middle", b: "bottom" };
const ALIGN = { l: "left", ctr: "center", r: "right", just: "justify", dist: "justify" };
const AUTONUM = { arabicPeriod: "arabicPeriod", arabicParenR: "arabicParenR", alphaLcPeriod: "alphaLcPeriod", alphaUcPeriod: "alphaUcPeriod", romanLcPeriod: "romanLcPeriod", romanUcPeriod: "romanUcPeriod" };

/** Text model -> PptxGenJS text run array. */
function textRuns(text) {
  const runs = [];
  text.paragraphs.forEach((para, pi) => {
    const last = pi === text.paragraphs.length - 1;
    const paraOptions = {
      align: ALIGN[para.align] || "left",
      indentLevel: para.level || 0,
      bullet: para.bullet ? (para.bullet.auto ? { type: "number", style: AUTONUM[para.bullet.auto] || "arabicPeriod" } : { code: (para.bullet.char || "•").codePointAt(0).toString(16).toUpperCase().padStart(4, "0") }) : false,
    };
    const items = para.runs.length ? para.runs : [{ text: "" }];
    items.forEach((run, ri) => {
      const options = {
        ...(ri === 0 ? paraOptions : {}),
        fontSize: run.size, bold: !!run.bold, italic: !!run.italic, strike: run.strike ? "sngStrike" : undefined,
        underline: run.underline ? { style: "sng" } : undefined, color: hex(run.color), fontFace: run.font,
      };
      if (ri === items.length - 1 && !last) options.breakLine = true;
      runs.push({ text: run.text === "\n" ? "" : run.text, options: run.text === "\n" ? { ...options, breakLine: true } : options });
    });
  });
  return runs;
}

function boxOptions(el) {
  return { x: inch(el.x), y: inch(el.y), w: inch(el.w), h: inch(el.h), rotate: el.rot || 0, flipH: !!el.flipH, flipV: !!el.flipV };
}

function shapeStyle(el) {
  return {
    fill: el.fill ? { color: hex(el.fill) } : undefined,
    line: el.line ? { color: hex(el.line.color), width: (el.line.width || 1) * 0.75 } : undefined,
  };
}

/** Deck model -> PPTX (Uint8Array). */
export async function exportPptx(deck, title = "Presentation") {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "DECK", width: inch(deck.width), height: inch(deck.height) });
  pptx.layout = "DECK";
  pptx.title = title;
  const exported = []; // per slide: the element ids in the order of their shapes in the slide XML
  for (const slide of deck.slides) {
    const s = pptx.addSlide();
    const ids = [];
    exported.push(ids);
    if (slide.background) s.background = { color: hex(slide.background) };
    if (slide.notes) s.addNotes(slide.notes);
    for (const el of slide.elements) {
      if (el.type === "image") {
        ids.push(el.id);
        s.addImage({ data: el.image.src, ...boxOptions(el) });
      } else if (el.type === "table") {
        const rows = el.table.rows.map((row) => row.cells.filter((c) => !c.hMerge && !c.vMerge).map((cell) => ({
          text: cell.text ? textRuns(cell.text) : "",
          options: { fill: cell.fill ? { color: hex(cell.fill) } : undefined, colspan: cell.span > 1 ? cell.span : undefined },
        })));
        ids.push(el.id);
        s.addTable(rows, { x: inch(el.x), y: inch(el.y), w: inch(el.w), colW: el.table.columns.map(inch), rowH: el.table.rows.map((r) => inch(r.height)) });
      } else if (el.text) {
        ids.push(el.id);
        const [l, t, r, b] = (el.text.insets || [9.6, 4.8, 9.6, 4.8]).map((v) => v * 0.75); // px -> pt
        s.addText(textRuns(el.text), {
          ...boxOptions(el), ...shapeStyle(el), valign: VALIGN[el.text.anchor] || "top", margin: [l, r, b, t],
          shape: el.type === "shape" ? SHAPES[el.geometry] || "rect" : undefined,
        });
      } else if (el.type === "shape") {
        ids.push(el.id);
        s.addShape(SHAPES[el.geometry] || "rect", { ...boxOptions(el), ...shapeStyle(el) });
      }
    }
  }
  const bytes = await pptx.write({ outputType: "uint8array" });
  return deck.slides.some((s) => s.transition || (s.animations && s.animations.length)) ? addMotion(bytes, deck, exported) : bytes;
}

// ---- transitions and animations ---------------------------------------------------------------------

const PRESET = { appear: [1, 0], fade: [10, 0], fly: [2, 4], zoom: [53, 16] }; // presetID, presetSubtype (fly: from the bottom)

function transitionXml(tr) {
  const spd = tr.duration <= 0.6 ? "fast" : tr.duration <= 0.9 ? "med" : "slow";
  const adv = tr.advanceAfter > 0 ? ` advTm="${Math.round(tr.advanceAfter * 1000)}"` : "";
  const dir = ["push", "wipe", "cover"].includes(tr.type) ? ` dir="${["l", "r", "u", "d"].includes(tr.dir) ? tr.dir : "l"}"` : "";
  const effect = { fade: "fade", push: "push", wipe: "wipe", cover: "cover", zoom: "zoom" }[tr.type] || "fade";
  return `<p:transition spd="${spd}"${adv}><p:${effect}${dir}/></p:transition>`;
}

/** The main sequence of entrance effects: one click group per "on click", "with"/"after" join the group before. */
function timingXml(animations, spids) {
  let id = 3;
  const groups = [];
  for (const a of animations) {
    const spid = spids.get(a.id);
    if (!spid) continue;
    if (!groups.length || a.start === "click") groups.push([]);
    groups[groups.length - 1].push({ ...a, spid });
  }
  if (!groups.length) return "";
  const effect = (a, delay) => {
    const [preset, sub] = PRESET[a.effect] || PRESET.fade;
    const node = a.start === "with" ? "withEffect" : a.start === "after" ? "afterEffect" : "clickEffect";
    const target = `<p:tgtEl><p:spTgt spid="${a.spid}"/></p:tgtEl>`;
    const show = `<p:set><p:cBhvr><p:cTn id="${id++}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>${target}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>`;
    let motion = "";
    if (a.effect === "fade") motion = `<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${id++}" dur="500"/>${target}</p:cBhvr></p:animEffect>`;
    if (a.effect === "fly") motion = `<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="${id++}" dur="500" fill="hold"/>${target}<p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="1+#ppt_h/2"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="#ppt_y"/></p:val></p:tav></p:tavLst></p:anim>`;
    if (a.effect === "zoom") motion = `<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${id++}" dur="500"/>${target}</p:cBhvr></p:animEffect><p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="${id++}" dur="500" fill="hold"/>${target}<p:attrNameLst><p:attrName>ppt_w</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:fltVal val="0"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="#ppt_w"/></p:val></p:tav></p:tavLst></p:anim>`;
    return `<p:par><p:cTn id="${id++}" presetID="${preset}" presetClass="entr" presetSubtype="${sub}" fill="hold" nodeType="${node}"><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst><p:childTnLst>${show}${motion}</p:childTnLst></p:cTn></p:par>`;
  };
  const clicks = groups.map((group) => {
    // "after" effects start when the effects before them have finished (500 ms each)
    let delay = 0;
    const parts = group.map((a, i) => { if (a.start === "after" && i > 0) delay += 500; return effect(a, delay); });
    return `<p:par><p:cTn id="${id++}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="${id++}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${parts.join("")}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>`;
  });
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${clicks.join("")}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;
}

/** Insert <p:transition> and <p:timing> into the slides (after p:clrMapOvr, before p:extLst, as the schema orders them). */
function addMotion(bytes, deck, exported) {
  const files = unzipSync(bytes);
  deck.slides.forEach((slide, i) => {
    const name = `ppt/slides/slide${i + 1}.xml`;
    if (!files[name] || !(slide.transition || (slide.animations && slide.animations.length))) return;
    let xml = strFromU8(files[name]);
    // shape ids in document order (the first cNvPr is the shape tree itself)
    const ids = [...xml.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/g)].map((m) => m[1]).slice(1);
    const spids = new Map(exported[i].map((elId, k) => [elId, ids[k]]));
    const extra = (slide.transition ? transitionXml(slide.transition) : "") + (slide.animations ? timingXml(slide.animations, spids) : "");
    const after = xml.indexOf("</p:cSld>");
    const ext = after >= 0 ? xml.indexOf("<p:extLst", after) : -1; // a slide-level extension list comes last
    xml = ext >= 0 ? xml.slice(0, ext) + extra + xml.slice(ext) : xml.replace("</p:sld>", `${extra}</p:sld>`);
    files[name] = strToU8(xml);
  });
  return zipSync(files);
}
