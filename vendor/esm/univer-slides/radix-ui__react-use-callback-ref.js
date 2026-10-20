/* @radix-ui/react-use-callback-ref@1.1.4 (jsDelivr +esm) */
import*as t from"react";var u=Object.defineProperty,c=(e,r)=>u(e,"name",{value:r,configurable:!0});function a(e){const r=t.useRef(e);return t.useEffect(()=>{r.current=e}),t.useMemo(()=>((...f)=>r.current?.(...f)),[])}c(a,"useCallbackRef");export{a as useCallbackRef};
