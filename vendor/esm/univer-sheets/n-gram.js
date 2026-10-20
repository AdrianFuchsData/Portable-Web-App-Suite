/* n-gram@2.0.1 (jsDelivr +esm) */
var o=a(2),u=a(3);function a(r){if(typeof r!="number"||Number.isNaN(r)||r<1||r===Number.POSITIVE_INFINITY)throw new Error("`"+r+"` is not a valid argument for `n-gram`");return m;function m(e){var n=[],i,t;if(e==null||(t=e.slice?e:String(e),i=t.length-r+1,i<1))return n;for(;i--;)n[i]=t.slice(i,i+r);return n}}export{o as bigram,a as nGram,u as trigram};
