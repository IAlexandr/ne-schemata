'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.graphQLExtensionHandler = graphQLExtensionHandler;
exports.register = register;

var _Schemata = require('./Schemata');

var _fs = require('fs');

var _path = require('path');

/**
 * Adds the ability to `require` or `import` files ending in a `.graphql`
 * extension. The exports returned from such an import consist of four
 * major values and one default value.
 *
 * values:
 *   astNode   - an ASTNode document object representing the SDL contents
 *               of the .graphql file contents. Null if the text is invalid
 *   resovlers - if there is an adjacent file with the same name, ending in
 *               .js and it exports either a `resolvers` key or an object by
 *               default, this value will be set on the sdl object as its set
 *               resolvers/rootObj
 *   schema    - a GraphQLSchema instance object if the contents of the .graphql
 *               file represent both valid SDL and contain at least one root
 *               type such as Query, Mutation or Subscription
 *   sdl       - the string of SDL wrapped in an instance of Schemata
 *   typeDefs  - the raw string used that `sdl` wraps
 *   default   - the sdl string wrapped in an instance of Schemata is the
 *               default export
 *
 * @param {Module} module a node JS Module instance
 * @param {string} filename a fully qualified path to the file being imported
 */
function graphQLExtensionHandler(module, filename) {
  let content = (0, _fs.readFileSync)(filename);
  let schemata = new _Schemata.Schemata(content.toString());
  let schema = schemata.schema;
  let astNode = schemata.ast;
  let resolvers;
  let jsFilename;
  let jsModule;

  try {
    jsFilename = filename.replace((0, _path.extname)(filename), '.js');
    jsModule = require((0, _path.resolve)(jsFilename));
    resolvers = jsModule.resolvers || typeof jsModule == 'object' && jsModule;
  } catch (error) {
    console.error(error);

    process.nextTick(() => {
      delete require.cache[(0, _path.resolve)(jsFilename)];
    });

    resolvers = null;
  }

  // Assign the resolvers to the sdl string
  schemata.resolvers = resolvers;
  if (schemata.resolvers) {
    schemata.clearSchema();
    schema = schemata.schema;
  }

  // For all intents and purposes this is an object that can be treated like
  // a string but that also has three extra properties; sdl, ast and schema.
  // `ast` and `schema` invoke the functions `parse` and `buildSchema` from
  // the 'graphql' module, respectively
  module.exports = {
    astNode,
    default: schemata,
    resolvers,
    schema,
    sdl: schemata,
    schemata,
    typeDefs: schemata
  };
}

function register(extension = '.graphql') {
  require.extensions = require.extensions || {};
  require.extensions[extension] = graphQLExtensionHandler;
}

exports.default = register;
//# sourceMappingURL=GraphQLExtension.js.map