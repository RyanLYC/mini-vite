const Koa = require("koa");
const fs = require("fs");
const path = require("path");
const compilerSfc = require("@vue/compiler-sfc"); // .vue
const compilerDom = require("@vue/compiler-dom"); // 模板

function rewriteImport(content) {
  return content.replace(/ from ['|"]([^'"]+)['|"]/g, function (s0, s1) {
    // console.log("s", s0, s1);
    // . ../ /开头的，都是相对路径
    if (s1[0] !== "." && s1[1] !== "/") {
      return ` from '/@modules/${s1}'`;
    } else {
      return s0;
    }
  });
}

const app = new Koa();
app.use(async (ctx) => {
  const {
    request: { url, query },
  } = ctx;
  console.log("url:" + url, "query type", query.type);
  // ⾸⻚
  if (url == "/") {
    ctx.type = "text/html";
    let content = fs.readFileSync("./index.html", "utf-8");
    content = content.replace(
      "<script ",
      `
      <script>
      window.process = {env:{ NODE_ENV:'dev'}}
      </script>
      <script
      `
    );
    ctx.body = content;
  } else if (url.endsWith(".js")) {
    // js⽂件
    const p = path.resolve(__dirname, url.slice(1));
    ctx.type = "application/javascript";
    const content = fs.readFileSync(p, "utf-8");
    ctx.body = rewriteImport(content);
  } else if (url.startsWith("/@modules/")) {
    // 这是⼀个node_module⾥的东⻄
    const prefix = path.resolve(
      __dirname,
      "node_modules",
      url.replace("/@modules/", "")
    );
    const module = require(prefix + "/package.json").module;
    const p = path.resolve(prefix, module);
    const ret = fs.readFileSync(p, "utf-8");
    ctx.type = "application/javascript";
    ctx.body = rewriteImport(ret);
  }
  if (url.endsWith(".css")) {
    const p = path.resolve(__dirname, url.slice(1));
    const file = fs.readFileSync(p, "utf-8");
    const content = `
    const css = "${file.replace(/\n/g, "")}"
    let link = document.createElement('style')
    link.setAttribute('type', 'text/css')
    document.head.appendChild(link)
    link.innerHTML = css
    export default css
    `;
    ctx.type = "application/javascript";
    ctx.body = content;
  } else if (url.indexOf(".vue") > -1) {
    // vue单⽂件组件
    const p = path.resolve(__dirname, url.split("?")[0].slice(1));
    const { descriptor } = compilerSfc.parse(fs.readFileSync(p, "utf-8"));
    if (!query.type) {
      ctx.type = "application/javascript";
      // 借⽤vue⾃导的compile框架 解析单⽂件组件，其实相当于vue-loader做的事情
      ctx.body = `
    ${rewriteImport(
      descriptor.script.content.replace("export default ", "const __script = ")
    )}
    import { render as __render } from "${url}?type=template"
    __script.render = __render
    export default __script
    `;
    } else if (query.type === "template") {
      // 模板内容
      const template = descriptor.template;
      // 在server端compiler做了
      const render = compilerDom.compile(template.content, {
        mode: "module",
      }).code;
      ctx.type = "application/javascript";
      ctx.body = rewriteImport(render);
    }
  }
});
app.listen(3000, () => {
  console.log("Vite Start ....");
});
