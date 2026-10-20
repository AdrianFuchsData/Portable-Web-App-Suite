/* nanoid@2.1.11 (jsDelivr +esm) */
var t,o;function u(){if(o)return t;o=1;for(var i=self.crypto||self.msCrypto,e="-_",r=36;r--;)e+=r.toString(36);for(r=36;r---10;)e+=r.toString(36).toUpperCase();return t=function(n){var a="",s=i.getRandomValues(new Uint8Array(n||21));for(r=n||21;r--;)a+=e[s[r]&63];return a},t}var d=u();export{d as default};
