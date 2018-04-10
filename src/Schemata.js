// @flow

import type {
  ASTNode,
  BuildSchemaOptions,
  DirectiveNode,
  EnumValueNode,
  ExecutionResult,
  FieldNode,
  GraphQLFieldResolver,
  GraphQLScalarTypeConfig,
  NamedTypeNode,
  ObjMap,
  ParseOptions,
  ScalarTypeDefinitionNode,
  Source,
} from 'graphql'

import { GraphQLSchema, GraphQLObjectType, printSchema } from 'graphql'
import { inline } from 'ne-tag-fns'
import merge from 'deepmerge'

import {
  forEachOf,
  forEachField,

  ALL,
  TYPES,
  INTERFACES,
  ENUMS,
  UNIONS,
  SCALARS,
  ROOT_TYPES,
  HIDDEN
} from './forEachOf'

import type { ForEachOfResolver, ForEachFieldResolver } from './forEachOf'

/**
 * Walk the supplied GraphQLSchema instance and retrieve the resolvers stored
 * on it. These values are then returned with a [typeName][fieldName] pathing
 *
 * @param {GraphQLSchema} schema an instance of GraphQLSchema
 * @return {Object} an object containing a mapping of typeName.fieldName that
 * links to the resolve() function it is associated within the supplied schema
 */
export function stripResolversFromSchema(
  schema: GraphQLSchema
): ?Object {
  let resolvers = {}

  if (!schema) {
    return null
  }

  forEachField(schema, (
    type,
    typeName,
    typeDirectives,
    field,
    fieldName,
    fieldArgs,
    fieldDirectives,
    _schema,
    context
  ) => {
    if (field.resolve) {
      resolvers[typeName] = resolvers[typeName] || {}
      resolvers[typeName][fieldName] = resolvers[typeName][fieldName] || {}
      resolvers[typeName][fieldName] = field.resolve
    }
  })

  return resolvers
}

/**
 * The callback for collision when a field is trying to be merged with an
 * existing field.
 *
 * @param {ASTNode} leftType the ASTNode, usually denoting a type, that will
 * receive the merged type's field from the right
 * @param {FieldNode} leftField the FieldNode denoting the value that should
 * be modified or replaced
 * @param {ASTNode} rightType the ASTNode containing the field to be merged
 * @param {FieldNode} rightField the FieldNode requesting to be merged and
 * finding a conflicting value already present
 * @return {FieldNode} the field to merge into the existing schema layout. To
 * ignore changes, returning the leftField is sufficient enough. The default
 * behavior is to always take the right hand value, overwriting new with old
 */
export type FieldMergeResolver = (
  leftType: ASTNode,
  leftField: FieldNode,
  rightType: ASTNode,
  rightField: FieldNode
) => FieldNode

/**
 * The callback for collision when a directive is trying to be merged with an
 * existing directive.
 *
 * @param {ASTNode} leftType the ASTNode, usually denoting a type, that will
 * receive the merged type's directive from the right
 * @param {DirectiveNode} leftDirective the DirectiveNode denoting the value
 * that should be modified or replaced
 * @param {ASTNode} rightType the ASTNode containing the directive to be merged
 * @param {DirectiveNode} rightDirective the DirectiveNode requesting to be
 * merged and finding a conflicting value already present
 * @return {DirectiveNode} the directive to merge into the existing schema
 * layout. To ignore changes, returning the leftDirective is sufficient enough.
 * The default behavior is to always take the right hand value, overwriting
 * new with old
 */
export type DirectiveMergeResolver = (
  leftType: ASTNode,
  leftDirective: DirectiveNode,
  rightType: ASTNode,
  rightDirective: DirectiveNode
) => DirectiveNode

/**
 * The callback for collision when a enum value is trying to be merged with an
 * existing enum value of the same name.
 *
 * @param {ASTNode} leftType the ASTNode, usually denoting a type, that will
 * receive the merged type's enum value from the right
 * @param {EnumValueNode} leftValue the EnumValueNode denoting the value
 * that should be modified or replaced
 * @param {ASTNode} rightType the ASTNode containing the enum value to be
 * merged
 * @param {EnumValueNode} rightValue the EnumValueNode requesting to be
 * merged and finding a conflicting value already present
 * @return {EnumValueNode} the enum value to merge into the existing schema
 * layout. To ignore changes, returning the leftValue is sufficient enough.
 * The default behavior is to always take the right hand value, overwriting
 * new with old
 */
export type EnumMergeResolver = (
  leftType: ASTNode,
  leftValue: EnumValueNode,
  rightType: ASTNode,
  rightValue: EnumValueNode
) => EnumValueNode

/**
 * The callback for collision when a union type is trying to be merged with an
 * existing union type of the same name.
 *
 * @param {ASTNode} leftType the ASTNode, usually denoting a type, that will
 * receive the merged type's union type from the right
 * @param {NamedTypeNode} leftValue the NamedTypeNode denoting the value
 * that should be modified or replaced
 * @param {ASTNode} rightType the ASTNode containing the union type to be
 * merged
 * @param {NamedTypeNode} rightValue the NamedTypeNode requesting to be
 * merged and finding a conflicting value already present
 * @return {NamedTypeNode} the union type to merge into the existing schema
 * layout. To ignore changes, returning the leftUnion is sufficient enough.
 * The default behavior is to always take the right hand value, overwriting
 * new with old
 */
export type UnionMergeResolver = (
  leftType: ASTNode,
  leftUnion: NamedTypeNode,
  rightType: ASTNode,
  rightUnion: NamedTypeNode
) => NamedTypeNode

/**
 * A callback for to resolve merge conflicts with custom scalar types defined
 * by the user.
 *
 * @param {ScalarTypeDefinitionNode} leftScalar the definition node found when
 * parsing ASTNodes. This is the existing value that conflicts with the to be
 * merged value
 * @param {GraphQLScalarTypeConfig} leftConfig *if* there is a resolver defined
 * for the existing ScalarTypeDefinitionNode it will be provided here. If this
 * value is null, there is no availabe config with serialize(), parseValue() or
 * parseLiteral() to work with.
 * @param {ScalarTypeDefinitionNode} rightScalar the definition node found when
 * parsing ASTNodes. This is to be merged value that conflicts with the
 * existing value
 * @param {GraphQLScalarTypeConfig} rightConfig *if* there is a resolver
 * defined for the existing ScalarTypeDefinitionNode it will be provided here.
 * If this value is null, there is no availabe config with serialize(),
 * parseValue() or parseLiteral() to work with.
 * @return {GraphQLScalarTypeConfig} whichever type config or resolver was
 * desired should be returned here.
 *
 * @see https://www.apollographql.com/docs/graphql-tools/scalars.html
 * @see http://graphql.org/graphql-js/type/#graphqlscalartype
 */
export type ScalarMergeResolver = (
  leftScalar: ScalarTypeDefinitionNode,
  leftConfig: GraphQLScalarTypeConfig,
  rightScalar: ScalarTypeDefinitionNode,
  rightConfig: GraphQLScalarTypeConfig
) => GraphQLScalarTypeConfig

/**
 * An object that specifies the various types of resolvers that might occur
 * during a given conflict resolution
 */
export type ConflictResolvers = {
  /** A handler for resolving fields in matching types */
  fieldMergeResolver?: FieldMergeResolver,

  /** A handler for resolving directives in matching types */
  directiveMergeResolver?: DirectiveMergeResolver,

  /** A handler for resolving conflicting enum values */
  enumValueMergeResolver?: EnumMergeResolver,

  /** A handler for resolving type values in unions */
  typeValueMergeResolver?: UnionMergeResolver,

  /** A handler for resolving scalar config conflicts in custom scalars */
  scalarMergeResolver?: ScalarMergeResolver
}

/** @type {Symbol} a unique symbol used as a key to all instance sdl strings */
export const TYPEDEFS_KEY = Symbol()

/** @type {Symbol} a constant symbol used as a key to a flag for express-gql */
export const GRAPHIQL_FLAG = Symbol.for('superfluous graphiql flag')

/** @type {Symbol} a unique symbol used as a key to all instance `WeakMap`s */
export const MAP = Symbol()

/** @type {Symbol} a key used to store the __executable__ flag on a schema */
export const EXE = Symbol()

/** @type {Object} a key used to store a resolver object in a WeakMap */
const wmkResolvers = Object(Symbol())

/** @type {Object} a key used to store an internal schema in a WeakMap */
const wmkSchema = Object(Symbol())

/**
 * The default field resolver blindly takes returns the right field. This
 * resolver is used when one is not specified.
 *
 * @param {ASTNode} leftType The matching left type indicating conflict
 * @param {FieldNode} leftField The field causing the conflict
 * @param {ASTNode} rightType The matching right type indicating conflict
 * @param {FieldNode} rightField the field cause the conflict
 *
 * @return {FieldNode} the field that should be used after resolution
 */
export function DefaultFieldMergeResolver(
  leftType: ASTNode,
  leftField: FieldNode,
  rightType: ASTNode,
  rightField: FieldNode
): FieldNode {
  return rightField
}

/**
 * The default directive resolver blindly takes returns the right field. This
 * resolver is used when one is not specified.
 *
 * @param {ASTNode} leftType The matching left type indicating conflict
 * @param {DirectiveNode} leftDirective The field causing the conflict
 * @param {ASTNode} rightType The matching right type indicating conflict
 * @param {DirectiveNode} rightDirective the field cause the conflict
 *
 * @return {DirectiveNode} the directive that should be used after resolution
 */
export function DefaultDirectiveMergeResolver(
  leftType: ASTNode,
  leftDirective: DirectiveNode,
  rightType: ASTNode,
  rightDirective: DirectiveNode
): DirectiveNode {
  return rightDirective
}

/**
 * The default field resolver blindly takes returns the right field. This
 * resolver is used when one is not specified.
 *
 * @param {ASTNode} leftType The matching left type indicating conflict
 * @param {DirectiveNode} leftDirective The field causing the conflict
 * @param {ASTNode} rightType The matching right type indicating conflict
 * @param {DirectiveNode} rightDirective the field cause the conflict
 *
 * @return {DirectiveNode} the directive that should be used after resolution
 */
export function DefaultEnumMergeResolver(
  leftType: ASTNode,
  leftValue: EnumValueNode,
  rightType: ASTNode,
  rightValue: EnumValueNode
): EnumValueNode {
  return rightValue
}

/**
 * The default union resolver blindly takes returns the right type. This
 * resolver is used when one is not specified.
 *
 * @param {ASTNode} leftType The matching left type indicating conflict
 * @param {NamedTypeNode} leftUnion The named node causing the conflict
 * @param {ASTNode} rightType The matching right type indicating conflict
 * @param {NamedTypeNode} rightUnion the named node cause the conflict
 *
 * @return {NamedTypeNode} the directive that should be used after resolution
 */
export function DefaultUnionMergeResolver(
  leftType: ASTNode,
  leftUnion: NamedTypeNode,
  rightType: ASTNode,
  rightUnion: NamedTypeNode
): NamedTypeNode {
  return rightUnion
}

/**
 * The default scalar merge resolver returns the right config when there is
 * one, otherwise the left one or null will be the default result. This is
 * slightly different behavior since resolvers for scalars are not always
 * available.
 *
 * @param {GraphQLScalarTypeConfig} leftConfig *if* there is a resolver defined
 * for the existing ScalarTypeDefinitionNode it will be provided here. If this
 * value is null, there is no availabe config with serialize(), parseValue() or
 * parseLiteral() to work with.
 * @param {ScalarTypeDefinitionNode} rightScalar the definition node found when
 * parsing ASTNodes. This is to be merged value that conflicts with the
 * existing value
 * @param {GraphQLScalarTypeConfig} rightConfig *if* there is a resolver
 * defined for the existing ScalarTypeDefinitionNode it will be provided here.
 * If this value is null, there is no availabe config with serialize(),
 * parseValue() or parseLiteral() to work with.
 * @return {GraphQLScalarTypeConfig} whichever type config or resolver was
 * desired should be returned here.
 *
 * @see https://www.apollographql.com/docs/graphql-tools/scalars.html
 * @see http://graphql.org/graphql-js/type/#graphqlscalartype
 */
export function DefaultScalarMergeResolver(
  leftScalar: ScalarTypeDefinitionNode,
  leftConfig: GraphQLScalarTypeConfig,
  rightScalar: ScalarTypeDefinitionNode,
  rightConfig: GraphQLScalarTypeConfig
): GraphQLScalarTypeConfig {
  return rightConfig ? rightConfig : (leftConfig || null)
}

/**
 * In order to facilitate merging, there needs to be some contingency plan
 * for what to do when conflicts arise. This object specifies one of each
 * type of resolver. Each simply takes the right-hand value.
 *
 * @type {Object}
 */
export const DefaultConflictResolvers: ConflictResolvers = {
  /** A handler for resolving fields in matching types */
  fieldMergeResolver: DefaultFieldMergeResolver,

  /** A handler for resolving directives in matching types */
  directiveMergeResolver: DefaultDirectiveMergeResolver,

  /** A handler for resolving conflicting enum values */
  enumValueMergeResolver: DefaultEnumMergeResolver,

  /** A handler for resolving type values in unions */
  typeValueMergeResolver: DefaultUnionMergeResolver,

  /** A handler for resolving scalar configs in custom scalars */
  scalarMergeResolver: DefaultScalarMergeResolver
};

const subTypeResolverMap: Map<string, Function> = new Map()
subTypeResolverMap.set('fields', 'fieldMergeResolver')
subTypeResolverMap.set('directives', 'directiveMergeResolver')
subTypeResolverMap.set('values', 'enumValueMergeResolver')
subTypeResolverMap.set('types', 'typeValueMergeResolver')
subTypeResolverMap.set('scalars', 'scalarMergeResolver')

/**
 * Compares and combines a subset of ASTNode fields. Designed to work on all
 * the various types that might have a merge conflict.
 *
 * @param {string} subTypeName the name of the field type; one of the following
 * values: 'fields', 'directives', 'values', 'types'
 * @param {ASTNode} lType the lefthand type containing the subtype to compare
 * @param {ASTNode} lSubType the lefthand subtype; fields, directive, value or
 * named union type
 * @param {ASTNode} rType the righthand type containing the subtype to compare
 * @param {ASTNode} rSubType the righthand subtype; fields, directive, value or
 * named union type
 */
function combineTypeAndSubType(
  subTypeName: string,
  lType: ASTNode,
  rType: ASTNode,
  conflictResolvers: ConflictResolvers = DefaultConflictResolvers
): void {
  if (rType[subTypeName]) {
    for (let rSubType of rType[subTypeName]) {
      let lSubType = lType[subTypeName].find(
        f => f.name.value == rSubType.name.value
      )

      if (!lSubType) {
        lType[subTypeName].push(rSubType)
        continue
      }

      let resolver = subTypeResolverMap.get(subTypeName) || 'fieldMergeResolver'
      let resultingSubType = conflictResolvers[resolver](
        lType, lSubType, rType, rSubType
      )
      let index = lType.fields.indexOf(lSubType)

      lType[subTypeName].splice(index, 1, resultingSubType)
    }
  }
}

/**
 * Compares a subset of ASTNode fields. Designed to work on all the various
 * types that might have a merge conflict.
 *
 * @param {string} subTypeName the name of the field type; one of the following
 * values: 'fields', 'directives', 'values', 'types'
 * @param {ASTNode} lType the lefthand type containing the subtype to compare
 * @param {ASTNode} lSubType the lefthand subtype; fields, directive, value or
 * named union type
 * @param {ASTNode} rType the righthand type containing the subtype to compare
 * @param {ASTNode} rSubType the righthand subtype; fields, directive, value or
 * named union type
 */
function pareTypeAndSubType(
  subTypeName: string,
  lType: ASTNode,
  rType: ASTNode,
  resolvers: Object = {}
): void {
  for (let rSubType of rType[subTypeName]) {
    let lSubType = lType[subTypeName].find(
      f => f.name.value == rSubType.name.value
    )

    if (!lSubType) {
      continue
    }

    let index = lType.fields.indexOf(lSubType)
    lType[subTypeName].splice(index, 1)

    if (
      resolvers[lType.name.value]
      && resolvers[lType.name.value][lSubType.name.value]
    ) {
      delete resolvers[lType.name.value][lSubType.name.value]
    }
    else if (resolvers[lSubType.name.value]) {
      delete resolvers[lSubType.name.value]
    }
  }
}

/**
 * Small function that sorts through the typeDefs value supplied which can be
 * any one of a Schemata instance, GraphQLSchema instance, Source instance or a
 * string.
 *
 * @param {string|Source|Schemata|GraphQLSchema} typeDefs the input source from
 * which to create a Schemata string
 * @return {string} a string representing the thing supplied as typeDefs
 */
export function normalizeSource(
  typeDefs: string | Source | Schemata | GraphQLSchema,
  wrap: boolean = false
): (string | Schemata) {
  if (!typeDefs) {
    throw new Error(inline`
      normalizeSource(typeDefs): typeDefs was invalid when passed to the
      function \`normalizeSource\`. Please check your code and try again.

      (received: ${typeDefs})
    `)
  }

  let source = typeDefs.body
    || typeDefs.sdl
    || (typeof typeDefs === 'string' && typeDefs)
    || (typeDefs instanceof GraphQLSchema
      ? printSchema(typeDefs)
      : typeDefs.toString())

  return wrap ? Schemata.from(source) : source;
}

/**
 * A small `String` extension that makes working with SDL/IDL text far easier
 * in both your own libraries as well as in a nodeJS REPL. Built-in to what
 * appears to be a normal String for all intents and purposes, are the ability
 * to transform the string into a set of AST nodes, a built schema or back to
 * the SDL string.
 *
 * @class  Schemata
 */
export class Schemata extends String {
  /**
   * Creates a new `String`, presumably of SDL or IDL. The getter `.valid`
   * will provide some indication as to whether or not the code is valid.
   *
   * @constructor
   * @memberOf Schemata
   *
   * @param {string|Schemata|Source|GraphQLSchema} typeDefs an instance
   * of Schemata, a string of SDL, a Source instance of SDL or a GraphQLSchema
   * that can be printed as an SDL string
   * @param {Object} resolvers an object containing field resolvers for
   * for the schema represented with this string. [Optional]
   */
  constructor(
    typeDefs: string | Source | Schemata | GraphQLSchema,
    resolvers: ?Object = null
  ) {
    super(normalizeSource(typeDefs))

    resolvers = (
      resolvers
      || typeDefs instanceof Schemata && typeDefs.resolvers
      || typeDefs instanceof GraphQLSchema && stripResolversFromSchema(typeDefs)
      || null
    )

    this[GRAPHIQL_FLAG] = true
    this[TYPEDEFS_KEY] = normalizeSource(typeDefs)
    this[MAP] = new WeakMap()
    this[MAP].set(
      wmkSchema,
      typeDefs instanceof GraphQLSchema ? typeDefs : null
    )
    this[MAP].set(wmkResolvers, resolvers)

    // Mark a schema passed to use in the constructor as an executable schema
    // to prevent any replacement of the value by getters that generate a
    // schema from the SDL
    if (this[MAP].get(wmkSchema)) {
      this[MAP].get(wmkSchema)[EXE] = true
      this[MAP].get(wmkSchema)[Symbol.for('constructor-supplied-schema')] = true
    }
  }

  /**
   * Symbol.species ensures that any String methods used on this instance will
   * result in a Schemata instance rather than a String. NOTE: this does not
   * work as expected in current versions of node. This bit of code here is
   * basically a bit of future proofing for when Symbol.species starts working
   * with String extended classes
   *
   * @type {Function}
   */
  static get [Symbol.species](): Function { return Schemata }

  /**
   * Ensures that instances of Schemata report internally as Schemata object.
   * Specifically using things like `Object.prototype.toString`.
   *
   * @type {string}
   */
  get [Symbol.toStringTag](): string { return this.constructor.name }

  /**
   * Returns the AST nodes for this snippet of SDL. It will throw an error
   * if the string is not valid SDL/IDL.
   *
   * @return {ASTNode} any valid ASTNode supported by GraphQL
   */
  get ast(): ASTNode { return this.constructor.parse(this.sdl, false) }

  /**
   * Retrieves the `graphiql` flag, which defaults to true. This flag can
   * make setting up an endpoint from a Schemata instance easier with express-graphql
   *
   * @type {boolean}
   */
  get graphiql(): boolean { return this[GRAPHIQL_FLAG] }

  /**
   * Setter to alter the default 'true' flag to make an Schemata instance a
   * valid single argument to functions like `graphqlHTTP()` from express
   * GraphQL.
   *
   * NOTE: this flag means nothing to the Schemata class but might be useful in
   * your project.
   *
   * @type {boolean} true if graphiql should be started; false otherwise
   */
  set graphiql(value: boolean): void { this[GRAPHIQL_FLAG] = value }

  /**
   * Returns a GraphQLSchema object. Note this will fail and throw an error
   * if there is not at least one Query, Subscription or Mutation type defined.
   * If there is no stored schema, and there are resolvers, an executable
   * schema is returned instead.
   *
   * @return {GraphQLSchema} an instance of GraphQLSchema if valid SDL
   */
  get schema(): GraphQLSchema {
    if (this[MAP].get(wmkSchema)) {
      return this[MAP].get(wmkSchema)
    }

    try {
      if (this.resolvers && Object.keys(this.resolvers).length) {
        return this.executableSchema
      }
      else {
        this[MAP].set(wmkSchema, this.constructor.buildSchema(this.sdl, true))
        this[MAP].get(wmkSchema)[EXE] = false
      }
    }
    catch (error) {
      return null
    }

    return this[MAP].get(wmkSchema)
  }

  /**
   * Sets a GraphQLSchema object on the internal weak map store.
   *
   * @param {GraphQLSchema} schema an instance of GraphQLSchema instance to
   * store on the internal weak map. Any schema stored here will be modified
   * by methods that do so.
   */
  set schema(schema: ?GraphQLSchema): void {
    this[MAP].set(wmkSchema, schema)
  }

  /**
   * Returns a GraphQLSchema object, pre-bound, to the associated resolvers
   * methods in `.resolvers`. If `.resolvers` is falsey, an error will be
   * thrown.
   *
   * @return {GraphQLSchema} an instance of GraphQLSchema with pre-bound
   * resolvers
   */
  get executableSchema(): GraphQLSchema {
    const isRootType = (t) => {
      if (t === undefined || t === null || !t) {
        return false;
      }

      let name = (typeof t.name === 'string') ? t.name : t.name.value

      return ((t instanceof GraphQLObjectType) &&
        (t.name === 'Query'
        || t.name === 'Mutation'
        || t.name === 'Subscription')
      )
    }
    const Class = this.constructor
    const resolvers = this.resolvers
    let schema

    if (this[MAP].get(wmkSchema) && this.resolvers) {
      schema = this[MAP].get(wmkSchema)

      if (schema && schema[EXE]) {
        return schema
      }
    }

    try {
      this[MAP].set(wmkSchema, (schema = Class.buildSchema(this.sdl, true)))
    }
    catch (error) {
      return null
    }

    this.forEachField((
      type, typeName, typeDirectives,
      field, fieldName, fieldArgs, fieldDirectives,
      schema, context
    ) => {
      if (!resolvers) { return }

      if (isRootType(type) && resolvers[fieldName]) {
        field.resolve = resolvers[fieldName]
        field.astNode.resolve = resolvers[fieldName]
      }

      if (resolvers[typeName] && resolvers[typeName][fieldName]) {
        field.resolve = resolvers[typeName][fieldName]
        field.astNode.resolve = resolvers[typeName][fieldName]
      }
    })

    schema[EXE] = true
    this[MAP].set(wmkSchema, schema)

    return schema;
  }

  /**
   * Returns the string this instance was generated with.
   *
   * @return {string} the string this class instance represents
   */
  get sdl(): string { return this[TYPEDEFS_KEY] }

  /**
   * A synonym or alias for `.sdl`. Placed here for the express purpose of
   * destructuing when used with Apollo's makeExecutableSchema or other
   * libraries expecting values of the same name
   *
   * i.e.
   *   // sdl.typeDefs and sdl.resolvers will be where the function expects
   *   let schema = require('graphql-tools').makeExecutableSchema(sdl)
   *
   * @return {string} a string of SDL/IDL for use with graphql
   */
  get typeDefs(): string { return this.sdl }

  /**
   * An internal call to buildResolvers(true), thereby requesting a flattened
   * resolver map with Query, Mutation and Subscription fields exposed as root
   * objects the way the Facebook reference implementation expects
   *
   * @return {Object} an object of functions or an empty object otherwise
   */
  get rootValue(): Object { return this.buildResolvers(true) }

  /**
   * Returns any resolvers function object associated with this instance.
   *
   * @return {Object} an object containing field resolvers or null if none
   * are stored within
   */
  get resolvers(): Object { return this[MAP].get(wmkResolvers) }

  /**
   * A method to fetch a particular field resolver from the schema represented
   * by this Schemata instance.
   *
   * @param {string} type the name of the type desired
   * @param {string} field the name of the field containing the resolver
   * @return {Function} the function resolver for the type and field in
   * question
   */
  schemaResolverFor(type: string, field: string): ?Function {
    if (
      !this.resolvers
      || !Object.keys(this.resolvers).length
      || !this.valid
    ) {
      return null
    }

    let _type = this.executableSchema.getType(type)
    let _field = _type.getFields() && _type.getFields()[field] || null
    let resolve = _field && _field.resolve || null

    return resolve
  }

  /**
   * Builds a schema based on the SDL in the instance and then parses it to
   * fetch a named field in a named type. If either the type or field are
   * missing or if the SDL cannot be built as a schema, null is returned.
   *
   * @param {string} type the name of a type
   * @param {string} field the name of a field contained in the above type
   * @return {FieldNode} the field reference in the type and field supplied
   */
  schemaFieldByName(type: string, field: string): FieldNode {
    if (!this.validSchema) { return null }

    let _type = this.schema.getType(type)
    let _field = _type.getFields() && _type.getFields()[field] || null

    return _field
  }

  /**
   * For SDL that doesn't properly build into a GraphQLSchema, it can still be
   * parsed and searched for a type by name.
   *
   * @param {string} type the name of a type
   * @return {FieldNode} the field reference in the type and field supplied
   */
  astTypeByName(type: string): ASTNode {
    if (!this.validSDL) { return null }

    let _type = this.ast.definitions.find(f => f.name.value === type)

    return _type
  }

  /**
   * For SDL that doesn't properly build into a GraphQLSchema, it can still be
   * searched for a type and field.
   *
   * @param {string} type the name of a type
   * @param {string} field the name of a field contained in the above type
   * @return {FieldNode} the field reference in the type and field supplied
   */
  astFieldByName(type: string, field: string): FieldNode {
    if (!this.validSDL) { return null }

    let _type = this.ast.definitions.find(f => f.name.value === type)
    let _field = _type && _type.fields.find(f => f.name.value === field) || null

    return _field
  }

  /**
   * Walks the AST for this SDL string and checks for the names of the fields
   * of each of the root types; Query, Mutation and Subscription. If there are
   * no root types defined, false is returned.
   *
   * If there is at least one root type *and* some resolvers *and* at least one
   * of the fields of at least one root type is present in the root of the
   * resolvers map, true is returned. Otherwise, false.
   *
   * @return {boolean} true if the defined resolvers have at least one root
   * type field as a resolver on the root of the resolver map; false otherwise.
   */
  get hasFlattenedResolvers(): boolean {
    let asts = this.validSDL && this.ast.definitions || null

    if (!asts || !this.resolvers) { return false }

    let query = asts.find(f => f.name.value == 'Query')
    let mutation = asts.find(f => f.name.value == 'Mutation')
    let subscription = asts.find(f => f.name.value == 'Subscription')
    let resolvers = this.resolvers

    if (!query && !mutation && !subscription) {
      return false
    }

    for (let type of [query, mutation, subscription]) {
      if (!type || !type.fields) { continue }

      for (let field of type.fields) {
        if (field.name.value in resolvers) {
          return true
        }
      }
    }

    return false
  }

  /**
   * Merging Schematas are a common feature in the modern world of GraphQL.
   * Especially when there are multiple teams working in tandem. This feature
   * supports merging of types, extended types, interfaces, enums, unions,
   * input object types and directives for all of the above.
   *
   * @param {string|Schemata|Source|GraphQLSchema} schemaLanguage an instance
   * of Schemata, a string of SDL, a Source instance of SDL or a GraphQLSchema
   * that can be printed as an SDL string to define what to merge with the
   * values in this object instance
   * @param {ConflictResolvers} conflictResolvers an object containing up to
   * four methods, each describing how to handle a conflict when an associated
   * type of conflict occurs. If no object or method are supplied, the right
   * hande value always takes precedence over the existing value; replacing it
   * @return {Schemata} a new instance of Schemata
   */
  mergeSDL(
    schemaLanguage: string | Schemata | Source | GraphQLSchema,
    conflictResolvers: ?ConflictResolvers = DefaultConflictResolvers
  ): Schemata {
    let source = normalizeSource(schemaLanguage, true)

    if (!source) {
      throw new Error(inline`
        The call to mergeSDL(schemaLanguage, conflictResolvers) received an
        invalid value for schemaLanguage. Please check your code and try again.
        Received ${schemaLanguage}.
      `)
    }

    let lAST = this.ast
    let rAST = source.ast
    let _scalarFns = {}

    // Ensure we have default behavior with any custom behavior assigned
    // atop the default ones should only a partial custom be supplied.
    conflictResolvers = Object.assign(
      DefaultConflictResolvers,
      conflictResolvers
    )

    for (let rType of rAST.definitions) {
      let lType = lAST.definitions.find(a => a.name.value == rType.name.value)

      if (
        rType.kind
        && rType.kind.endsWith
        && rType.kind.endsWith('Extension')
      ) {
        rType = Object.assign({}, rType)
        rType.kind =
          rType.kind.substring(0, rType.kind.length - 9) + 'Definition'
      }

      if (!lType) {
        lAST.definitions.push(rType)
        continue
      }

      switch (lType.kind) {
        default:
        case 'ObjectTypeDefinition':
        case 'ObjectTypeDefinitionExtension':
        case 'InterfaceTypeDefinition':
        case 'InterfaceTypeDefinitionExtension':
        case 'InputObjectTypeDefinition':
        case 'InputObjectTypeDefinitionExtension':
          combineTypeAndSubType('directives', lType, rType, conflictResolvers)
          combineTypeAndSubType('fields', lType, rType, conflictResolvers)
          break;

        case 'EnumTypeDefinition':
          combineTypeAndSubType('directives', lType, rType, conflictResolvers)
          combineTypeAndSubType('values', lType, rType, conflictResolvers)
          break;

        case 'UnionTypeDefinition':
          combineTypeAndSubType('directives', lType, rType, conflictResolvers)
          combineTypeAndSubType('types', lType, rType, conflictResolvers)
          break;

        case 'ScalarTypeDefinitionNode':
          let lScalar, lScalarConfig, rScalar, rScalarConfig, resolver

          combineTypeAndSubType('directives', lType, rType, conflictResolvers)

          if (this.schema) {
            lScalar = this.schema.getType(lType.name.value)
            lScalarConfig = lScalar && lScalar._scalarConfig || null
          }

          if (source.schema) {
            rScalar = source.schema.getType(rType.name.value)
            rScalarConfig = rScalar && rScalar._scalarConfig || null
          }

          resolver = (
            conflictResolvers.scalarMergeResolver
            || DefaultConflictResolvers.scalarMergeResolver
          )(lType, lScalarConfig, rType, rScalarConfig)

          if (resolver) {
            _scalarFns[lType.name.value] = _scalarFns[lType.name.value] || {}
            _scalarFns[lType.name.value] = resolver
          }

          break;
      }
    }

    let merged = Schemata.from(this.constructor.gql.print(lAST))

    if (Object.keys(_scalarFns).length) {
      for (let typeName of Object.keys(_scalarFns)) {
        merged.schema.getType(typeName)._scalarConfig = _scalarConfig[typeName]
      }
    }

    return merged
  }

  /**
   * Paring down Schematas can be handy for certain types of schema stitching.
   * The SDL passed in and any associated resolvers will be removed from
   * a copy of the SDL in this Schemata instance represents and the resolver
   * map passed in.
   *
   * @param {string|Schemata|Source|GraphQLSchema} schemaLanguage an instance
   * of Schemata, a string of SDL, a Source instance of SDL or a GraphQLSchema
   * that can be printed as an SDL string to define what to pare with the
   * values in this object instance
   * @param {Object} resolverMap an object containing resolver functions, from
   * either those set on this instance or those in the resolverMap added in
   * @return {Schemata} a new Schemata instance with the changed values set
   * on it
   */
  pareSDL(
    schemaLanguage: string | Schemata | Source | GraphQLSchema,
    resolverMap: ?Object = null
  ): Schemata {
    let source = normalizeSource(schemaLanguage, true)
    if (!source) {
      throw new Error(inline`
        In the call to pareSDL(schemaLanguage), the supplied value for
        \`schemaLanguage\` could not be parsed.
      `)
    }

    if (schemaLanguage instanceof GraphQLSchema && !resolverMap) {
      resolverMap = stripResolversFromSchema(schemaLanguage)
    }

    let resolvers = Object.assign({}, resolverMap || this.resolvers || {})
    let lAST = this.ast
    let rAST = source.ast

    for (let rType of rAST.definitions) {
      let lType = lAST.definitions.find(a => a.name.value == rType.name.value)

      if (
        rType.kind
        && rType.kind.endsWith
        && rType.kind.endsWith('Extension')
      ) {
        let len = 'Extension'.length

        rType = Object.assign({}, rType)
        rType.kind =
          rType.kind.substring(0, rType.kind.length - len) + 'Definition'
      }

      if (!lType) {
        lAST.definitions.push(rType)
        continue
      }

      switch (lType.kind) {
        default:
        case 'ObjectTypeDefinition':
        case 'ObjectTypeDefinitionExtension':
        case 'InterfaceTypeDefinition':
        case 'InterfaceTypeDefinitionExtension':
        case 'InputObjectTypeDefinition':
        case 'InputObjectTypeDefinitionExtension':
          pareTypeAndSubType('directives', lType, rType, resolvers)
          pareTypeAndSubType('fields', lType, rType, resolvers)

          if (!lType.fields.length) {
            let index = lAST.definitions.indexOf(lType)

            if (index !== -1) {
              lAST.definitions.splice(index, 1)
            }
          }
          break;

        case 'EnumTypeDefinition':
          pareTypeAndSubType('directives', lType, rType, resolvers)
          pareTypeAndSubType('values', lType, rType, resolvers)

          if (!lType.values.length) {
            let index = lAST.definitions.indexOf(lType)

            if (index !== -1) {
              lAST.definitions.splice(index, 1)
            }
          }
          break;

        case 'UnionTypeDefinition':
          pareTypeAndSubType('directives', lType, rType, resolvers)
          pareTypeAndSubType('types', lType, rType, resolvers)

          if (!lType.types.length) {
            let index = lAST.definitions.indexOf(lType)

            if (index !== -1) {
              lAST.definitions.splice(index, 1)
            }
          }
          break;

        case 'ScalarTypeDefinitionNode':
          let index = lAST.definitions.indexOf(lType)

          if (index !== -1) {
            lAST.definitions.splice(index, 1)
          }
          break;
      }
    }

    let result = Schemata.from(this.constructor.gql.print(lAST), resolvers)
    result.executableSchema

    return result
  }

  /**
   * A new Schemata object instance with merged schema definitions as its
   * contents as well as merged resolvers and newly bound executable schema are
   * all created in this step and passed back. The object instance itself is
   * not modified
   *
   * Post merge, the previously stored and merged resolvers map are are applied
   * and a new executable schema is built from the ashes of the old.
   *
   * @param {GraphQLSchema} schema an instance of GraphQLSchema to merge
   * @param {ConflictResolvers} conflictResolvers an object containing up to
   * four methods, each describing how to handle a conflict when an associated
   * type of conflict occurs. If no object or method are supplied, the right
   * hande value always takes precedence over the existing value; replacing it
   * @return {Schemata} a new instance of Schemata with a merged schema string,
   * merged resolver map and newly bound executable schema attached are all
   * initiated
   */
  mergeSchema(
    schema: GraphQLSchema,
    conflictResolvers: ?ConflictResolvers = DefaultConflictResolvers
  ): Schemata {
    if (!schema) {
      throw new Error(inline`
        In the call to mergeSchema(schema), ${schema} was received as a value
        and the code could not proceed because of it. Please check your code
        and try again
      `)
    }

    let resolvers = this.buildResolvers()
    let mergeResolvers = stripResolversFromSchema(schema)

    resolvers = merge(this.buildResolvers(), mergeResolvers)

    let schemata = this.mergeSDL(schema)

    // Set the resolvers
    schemata.resolvers = resolvers

    // Trigger a new schema creation
    schemata.executableSchema

    return schemata
  }

  /**
   * Given a schema, based on the Schemata this object is based on, walk it and
   * build up a resolver map. This function will always return a non-null
   * object. It will be empty if there are either no resolvers to be found
   * in the schema or if a valid schema cannot be created.
   *
   * @param {boolean|Object} flattenRootResolversOrFirstParam if this value is
   * boolean, and if this value is true, the resolvers from Query, Mutation
   * and Subscription types will be flattened to the root of the object. If
   * the first parametr is an Object, it will be merged in normally with
   * Object.assign.
   * @param {Array<Object>} ...extendWith an unlimited array of objects that
   * can be used to extend the built resolver map.
   * @return {Object} a resolver map; i.e. an object of resolver functions
   */
  buildResolvers(
    flattenRootResolversOrFirstParam: boolean|Object,
    ...extendWith: Array<Object>
  ): Object {
    let schemata = Schemata.from(this.sdl, this.resolvers)
    let resolvers = Object.assign({},
      (stripResolversFromSchema(schemata.executableSchema)
        || schemata.resolvers
        || {}
      )
    )

    // Next check to see if we are flattening or simply extending
    if (typeof flattenRootResolversOrFirstParam === 'boolean') {
      for (let rootType of ['Query', 'Mutation', 'Subscription']) {
        if (flattenRootResolversOrFirstParam) {
          if (resolvers[rootType]) {
            for (let field of Object.keys(resolvers[rootType])) {
              resolvers[field] = resolvers[rootType][field]
              delete resolvers[rootType][field]
            }

            delete resolvers[rootType]
          }
        }
        else {
          for (let field of Object.keys(resolvers)) {
            if (schemata.schemaFieldByName(rootType, field)) {
              resolvers[rootType] = resolvers[rootType] || {}
              resolvers[rootType][field] = resolvers[field]
              delete resolvers[field]
            }
          }
        }
      }
    }
    else {
      Object.assign(resolvers, flattenRootResolversOrFirstParam)
    }

    // Finally extend with any remaining arguments
    if (extendWith.length) {
      Object.assign(resolvers, ...extendWith)
    }

    return resolvers
  }

  /**
   * A method to determine if an executable schema is attached to this Schemata
   * instance. It does so by walking the schema fields via `buildResolvers()`
   * and reporting whether there is anything inside the results or not.
   *
   * @return {boolean} true if there is at least one resolver on at least one
   * field of a type in this Schemata instance's schema.
   */
  get hasAnExecutableSchema(): boolean {
    return Object.keys(this.buildResolvers()).length > 0;
  }

  /**
   * If the `.sdl` property is valid SDL/IDL and can generate valid AST nodes
   * this function will return true. It will return false otherwise.
   *
   * @return {boolean} true if the string can be parsed; false otherwise
   */
  get validSDL(): boolean {
    try {
      this.constructor.gql.parse(this.sdl)
      return true
    }
    catch(e) {
      return false
    }
  }

  /**
   * If the `.schema` property is valid SDL/IDL and can generate a valid
   * GraphQLSchema, this function will return true. It will return false
   * otherwise.
   *
   * @return {boolean} true if the string can be parsed into a schema; false
   * otherwise
   */
  get validSchema(): boolean {
    try {
      this.schema;
      return true
    }
    catch (e) {
      return false
    }
  }

  /**
   * Returns true if the string underlying this instance represents valid SDL
   * that can be both converted to AST nodes or a valid GraphQLSchema instance
   *
   * @return {boolean} true if it is valid for both `parse()` as well as the
   * `buildSchema()` function
   */
  get valid(): boolean { return this.validSDL && this.validSchema }


  /**
   * If the internal resolvers object needs to be changed after creation, this
   * method allows a way to do so. Setting the value to `null` is equivalent
   * to removing any stored value. Finally the contents are stored in a weak
   * map so its contents are not guaranteed over a long period of time.
   *
   * @param {Object} resolvers an object containing field resolvers for this
   * string instance.
   */
  set resolvers(resolvers: ?Object): void {
    this[MAP].set(wmkResolvers, resolvers)
  }

  /**
   * Removes the resolver map associated with this Schemata instance
   */
  clearResolvers(): void {
    this.resolvers = null
  }

  /**
   * Removes the schema stored with this Schemata instance
   */
  clearSchema(): void {
    this.schema = null
  }

  /**
   * Returns the underlying string passed or generated in the constructor when
   * inspected in the nodeJS REPL.
   *
   * @return {string} the SDL/IDL string this class was created on
   */
  inspect(): string { return this.sdl }

  /**
   * The same as `inspect()`, `toString()`, and `valueOf()`. This method
   * returns the underlying string this class instance was created on.
   *
   * @return {string} [description]
   */
  toString(): string { return this.sdl }

  /**
   * The same as `inspect()`, `toString()`, and `valueOf()`. This method
   * returns the underlying string this class instance was created on.
   *
   * @return {string} [description]
   */
  valueOf(): string { return this.sdl }

  /**
   * Iterates over the values contained in a Schema's typeMap. If a desired
   * value is encountered, the supplied callback will be invoked. The values are
   * the constants ALL, TYPES, INTERFACES, ENUMS, UNIONS and SCALARS. Optionally
   * HIDDEN is another value that can be bitmasked together for a varied result.
   * HIDDEN exposes the values in the schema typemap that begin with a double
   * underscore.
   *
   * The signature for the function callback is as follows:
   * (
   *   type: mixed,
   *   typeName: string,
   *   typeDirectives: Array<GraphQLDirective>
   *   schema: GraphQLSchema,
   *   context: mixed,
   * ) => void
   *
   * Where:
   *   `type`           - the object instance from within the `GraphQLSchema`
   *   `typeName`       - the name of the object; "Query" for type Query and
   *                      so on.
   *   `typeDirectives` - an array of directives applied to the object or an
   *                      empty array if there are none applied.
   *   `schema`         - an instance of `GraphQLSchema` over which to iterate
   *   `context`        - usually an object, and usually the same object,
   *                      passed to the call to `makeExecutableSchema()`
   *                      or `graphql()`
   *
   * @param {Function} fn a function with a signature defined above
   * @param {mixed} context usually an object but any mixed value the denotes
   * some shared context as is used with the schema during normal runtime.
   * @param {Number} types a bitmask of one or more of the constants defined
   * above. These can be OR'ed together and default to TYPES.
   * @param {GraphQLSchema} suppliedSchema an optional schema to use rather
   * than the one created or stored internally generated from this SDL
   * @return {GraphQLSchema} a new schema is generated from this SDL, iterated
   * over and returned.
   */
  forEachOf(
    fn: ForEachOfResolver,
    context: mixed,
    types: number = TYPES,
    suppliedSchema: ?GraphQLSchema = null
  ): GraphQLSchema {
    let schema = suppliedSchema || this.schema

    forEachOf(schema, fn, context, types)

    return schema
  }

  /**
   * Shortcut to `forEachOf()` specific to types.
   *
   * @see #forEachOf
   *
   * @param {Function} fn a function with a signature defined above
   * @param {mixed} context usually an object but any mixed value the denotes
   * some shared context as is used with the schema during normal runtime.
   * @param {GraphQLSchema} suppliedSchema an optional schema to use rather
   * than the one created or stored internally generated from this Schemata
   * @return {GraphQLSchema} a new schema is generated from this Schemata, iterated
   * over and returned.
   */
  forEachType(
    fn: ForEachOfResolver,
    context: mixed,
    suppliedSchema: ?GraphQLSchema
  ): GraphQLSchema {
    return this.forEachOf(fn, context, TYPES, suppliedSchema)
  }

  /**
   * Shortcut to `forEachOf()` specific to input object types.
   *
   * @see #forEachOf
   *
   * @param {Function} fn a function with a signature defined above
   * @param {mixed} context usually an object but any mixed value the denotes
   * some shared context as is used with the schema during normal runtime.
   * @param {GraphQLSchema} suppliedSchema an optional schema to use rather
   * than the one created or stored internally generated from this Schemata
   * @return {GraphQLSchema} a new schema is generated from this Schemata, iterated
   * over and returned.
   */
  forEachInputObjectType(
    fn: ForEachOfResolver,
    context: mixed,
    suppliedSchema: ?GraphQLSchema
  ): GraphQLSchema {
    return this.forEachOf(fn, context, INPUT_TYPES, suppliedSchema)
  }

  /**
   * Shortcut to `forEachOf()` specific to unions.
   *
   * @see #forEachOf
   *
   * @param {Function} fn a function with a signature defined above
   * @param {mixed} context usually an object but any mixed value the denotes
   * some shared context as is used with the schema during normal runtime.
   * @param {GraphQLSchema} suppliedSchema an optional schema to use rather
   * than the one created or stored internally generated from this SDL
   * @return {GraphQLSchema} a new schema is generated from this SDL, iterated
   * over and returned.
   */
  forEachUnion(
    fn: ForEachOfResolver,
    context: mixed,
    suppliedSchema: ?GraphQLSchema
  ): GraphQLSchema {
    return this.forEachOf(fn, context, UNIONS, suppliedSchema)
  }

  /**
   * Shortcut to `forEachOf()` specific to enums.
   *
   * @see #forEachOf
   *
   * @param {Function} fn a function with a signature defined above
   * @param {mixed} context usually an object but any mixed value the denotes
   * some shared context as is used with the schema during normal runtime.
   * @param {GraphQLSchema} suppliedSchema an optional schema to use rather
   * than the one created or stored internally generated from this SDL
   * @return {GraphQLSchema} a new schema is generated from this SDL, iterated
   * over and returned.
   */
  forEachEnum(
    fn: ForEachOfResolver,
    context: mixed,
    suppliedSchema: ?GraphQLSchema
  ): GraphQLSchema {
    return this.forEachOf(fn, context, ENUMS, suppliedSchema)
  }

  /**
   * Shortcut to `forEachOf()` specific to interfaces.
   *
   * @see #forEachOf
   *
   * @param {Function} fn a function with a signature defined above
   * @param {mixed} context usually an object but any mixed value the denotes
   * some shared context as is used with the schema during normal runtime.
   * @param {GraphQLSchema} suppliedSchema an optional schema to use rather
   * than the one created or stored internally generated from this SDL
   * @return {GraphQLSchema} a new schema is generated from this SDL, iterated
   * over and returned.
   */
  forEachInterface(
    fn: ForEachOfResolver,
    context: mixed,
    suppliedSchema: ?GraphQLSchema
  ): GraphQLSchema {
    return this.forEachOf(fn, context, INTERFACES, suppliedSchema)
  }

  /**
   * Shortcut to `forEachOf()` specific to types.
   *
   * @see #forEachOf
   *
   * @param {Function} fn a function with a signature defined above
   * @param {mixed} context usually an object but any mixed value the denotes
   * some shared context as is used with the schema during normal runtime.
   * @param {GraphQLSchema} suppliedSchema an optional schema to use rather
   * than the one created or stored internally generated from this SDL
   * @return {GraphQLSchema} a new schema is generated from this SDL,
   * iterated over and returned.
   */
  forEachScalar(
    fn: ForEachOfResolver,
    context: mixed,
    suppliedSchema: ?GraphQLSchema
  ): GraphQLSchema {
    return this.forEachOf(fn, context, SCALARS, suppliedSchema)
  }

  /**
   * Shortcut to `forEachOf()` specific to all root types; Query, Mutation and
   * Subscription that exist within the schema.
   *
   * @see #forEachOf
   *
   * @param {Function} fn a function with a signature defined above
   * @param {mixed} context usually an object but any mixed value the denotes
   * some shared context as is used with the schema during normal runtime.
   * @param {GraphQLSchema} suppliedSchema an optional schema to use rather
   * than the one created or stored internally generated from this SDL
   * @return {GraphQLSchema} a new schema is generated from this SDL, iterated
   * over and returned.
   */
  forEachRootType(
    fn: ForEachOfResolver,
    context: mixed,
    suppliedSchema: ?GraphQLSchema
  ): GraphQLSchema {
    return this.forEachOf(fn, context, ROOT_TYPES, suppliedSchema)
  }

  /**
   * An extension of `forEachOf` that targets the fields of the types in the
   * schema's typeMap. This function provides more detail and allows greater
   * access to any associated `context` than the function of the same name
   * provided by the `graphql-tools` library.
   *
   * The signature for the callback function is as follows
   *
   * (
   *   type: mixed,
   *   typeName: string,
   *   typeDirectives: Array<GraphQLDirective>,
   *   field: mixed,
   *   fieldName: string,
   *   fieldArgs: Array<GraphQLArgument>,
   *   fieldDirectives: Array<GraphQLDirective>,
   *   schema: GraphQLSchema,
   *   context: mixed
   * ) => void
   *
   * Where
   *
   * Where:
   *   `type`           - the object instance from within the `GraphQLSchema`
   *   `typeName`       - the name of the object; "Query" for type Query and
   *                      so on
   *   `typeDirectives` - an array of directives applied to the object or an
   *                      empty array if there are none applied.
   *   `field`          - the field in question from the type
   *   `fieldName`      - the name of the field as a string
   *   `fieldArgs`      - an array of arguments for the field in question
   *   `fieldDirectives`- an array of directives applied to the field or an
   *                      empty array should there be no applied directives
   *   `schema`         - an instance of `GraphQLSchema` over which to iterate
   *   `context`        - usually an object, and usually the same object, passed
   *                      to the call to `makeExecutableSchema()` or `graphql()`
   *
   * @param {Function} fn a function with a signature defined above
   * @param {mixed} context usually an object but any mixed value the denotes
   * some shared context as is used with the schema during normal runtime.
   * @param {GraphQLSchema} suppliedSchema an optional schema to use rather
   * than the one created or stored internally generated from this SDL
   * @return {GraphQLSchema} a new schema is generated from this SDL, iterated
   * over and returned.
   */
  forEachField(
    fn: ForEachFieldResolver,
    context: mixed,
    types: number = ALL,
    suppliedSchema: ?GraphQLSchema = null
  ): GraphQLSchema {
    let schema = suppliedSchema || this.schema

    forEachField(schema, fn, context, types)

    return schema
  }

  /**
   * `forEachField()` shortcut focusing on GraphQLObjectTypes specifically.
   *
   * @param {ForEachFieldResolver} fn a callback function that is invoked for
   * each field of any GraphQLObjectType found
   * @param {mixed} context usually an object but any mixed value the denotes
   * some shared context as is used with the schema during normal runtime.
   * @param {GraphQLSchema} suppliedSchema an optional schema to use rather
   * than the one created or stored internally generated from this SDL
   * @return {GraphQLSchema} either the supplied GraphQLSchema or one generated
   * to facilitate the task
   */
  forEachTypeField(
    fn: ForEachFieldResolver,
    context: mixed,
    suppliedSchema: ?GraphQLSchema = null
  ): GraphQLSchema {
    let schema = suppliedSchema || this.schema

    forEachField(schema, fn, context, TYPES)

    return schema
  }

  /**
   * `forEachField()` shortcut focusing on GraphQLInterfaceType specifically.
   *
   * @param {ForEachFieldResolver} fn a callback function that is invoked for
   * each field of any GraphQLObjectType found
   * @param {mixed} context usually an object but any mixed value the denotes
   * some shared context as is used with the schema during normal runtime.
   * @param {GraphQLSchema} suppliedSchema an optional schema to use rather
   * than the one created or stored internally generated from this SDL
   * @return {GraphQLSchema} either the supplied GraphQLSchema or one generated
   * to facilitate the task
   */
  forEachInterfaceField(
    fn: ForEachFieldResolver,
    context: mixed,
    suppliedSchema: ?GraphQLSchema = null
  ): GraphQLSchema {
    let schema = suppliedSchema || this.schema

    forEachField(schema, fn, context, INTERFACES)

    return schema
  }

  /**
   * `forEachField()` shortcut focusing on GraphQLInputObjectType specifically.
   *
   * @param {ForEachFieldResolver} fn a callback function that is invoked for
   * each field of any GraphQLObjectType found
   * @param {mixed} context usually an object but any mixed value the denotes
   * some shared context as is used with the schema during normal runtime.
   * @param {GraphQLSchema} suppliedSchema an optional schema to use rather
   * than the one created or stored internally generated from this SDL
   * @return {GraphQLSchema} either the supplied GraphQLSchema or one generated
   * to facilitate the task
   */
  forEachInputObjectField(
    fn: ForEachFieldResolver,
    context: mixed,
    suppliedSchema: ?GraphQLSchema = null
  ): GraphQLSchema {
    let schema = suppliedSchema || this.schema

    forEachField(schema, fn, context, INPUT_TYPES)

    return schema
  }

  /**
   * Wrapper for `require('graphql').graphqlSync()` that automatically passes
   * in the internal `.schema` reference as the first parameter.
   *
   * @param {string|Source} query A GraphQL language formatted string
   * representing the requested operation.
   * @param {mixed} contextValue a bit of shared context to pass to resolvers
   * @param {Object} variableValues A mapping of variable name to runtime value
   * to use for all variables defined in the requestString.
   * @param {Object|null} The value provided as the first argument to resolver
   * functions on the top level type (e.g. the query object type).
   * @param {string} operationName The name of the operation to use if
   * requestString contains multiple possible operations. Can be omitted if
   * requestString contains only one operation.
   * @param {GraphQLFieldResolver<any, any>} fieldResolver A resolver function
   * to use when one is not provided by the schema. If not provided, the
   * default field resolver is used (which looks for a value or method on the
   * source value with the field's name).
   * @return {ExecutionResult} the requested results. An error is thrown if
   * the results could not be fulfilled or invalid input/output was specified.
   */
  run(
    query: string | Source,
    contextValue?: mixed,
    variableValues?: ?ObjMap<mixed>,
    rootValue?: mixed,
    operationName?: ?string,
    fieldResolver?: ?GraphQLFieldResolver<any,any>
  ): ExecutionResult {
    return this.constructor.gql.graphqlSync(
      this.schema,
      query,
      this.resolvers || rootValue,
      contextValue,
      variableValues,
      operationName,
      fieldResolver,
    )
  }

  /**
   * Wrapper for `require('graphql').graphql()` that automatically passes
   * in the internal `.schema` reference as the first parameter.
   *
   * @param {string|Source} query A GraphQL language formatted string
   * representing the requested operation.
   * @param {mixed} contextValue a bit of shared context to pass to resolvers
   * @param {Object} variableValues A mapping of variable name to runtime value
   * to use for all variables defined in the requestString.
   * @param {Object|null} The value provided as the first argument to resolver
   * functions on the top level type (e.g. the query object type).
   * @param {string} operationName The name of the operation to use if
   * requestString contains multiple possible operations. Can be omitted if
   * requestString contains only one operation.
   * @param {GraphQLFieldResolver<any, any>} fieldResolver A resolver function
   * to use when one is not provided by the schema. If not provided, the
   * default field resolver is used (which looks for a value or method on the
   * source value with the field's name).
   * @return {Promise<ExecutionResult>} a Promise contianing the requested
   * results
   */
  async runAsync(
    query: string | Source,
    contextValue?: mixed,
    variableValues?: ?ObjMap<mixed>,
    rootValue?: mixed,
    operationName?: ?string,
    fieldResolver?: ?GraphQLFieldResolver<any,any>
  ): Promise<ExecutionResult> {
    return this.constructor.gql.graphql(
      this.schema,
      query,
      this.resolvers || rootValue,
      contextValue,
      variableValues,
      operationName,
      fieldResolver,
    )
  }

  /**
   * A little wrapper used to catch any errors thrown when building a schema
   * from the string SDL representation of a given instance.
   *
   * @param {string|Schemata|Source|GraphQLSchema} sdl an instance
   * of Schemata, a string of SDL, a Source instance of SDL or a GraphQLSchema
   * that can be printed as an SDL string
   * @param {boolean} showError true if the error should be thrown, false if
   * the error should be silently suppressed
   * @param {BuildSchemaOptions&ParseOptions} schemaOpts for advanced users,
   * passing through additional buildSchema() options can be done here
   * @return {GraphQLSchema|null} null if an error occurs and errors are not
   * surfaced or a valid GraphQLSchema object otherwise
   */
  static buildSchema(
    sdl: string | Source | Schemata | GraphQLSchema,
    showError: boolean = false,
    schemaOpts: BuildSchemaOptions & ParseOptions = undefined
  ): ?GraphQLSchema {
    try {
      let source = normalizeSource(sdl)

      return this.gql.buildSchema(source, schemaOpts)
    }
    catch (e) {
      if (showError) { throw e }
      return null
    }
  }

  /**
   * A little wrapper used to catch any errors thrown when parsing Schemata for
   * ASTNodes. If showError is true, any caught errors are thrown once again.
   *
   * @param {string|Schemata|Source|GraphQLSchema} sdl an instance
   * of Schemata, a string of SDL, a Source instance of SDL or a GraphQLSchema
   * that can be printed as an SDL string
   * @param {boolean} showError if true, any caught errors will be thrown once
   * again
   * @return {ASTNode|null} null if an error occurs and errors are suppressed,
   * a top level Document ASTNode otherwise
   */
  static parse(
    sdl: string | Schemata | Source | GraphQLSchema,
    showError: boolean = false
  ): ?ASTNode {
    try {
      let source = normalizeSource(sdl)

      return this.gql.parse(source)
    }
    catch (e) {
      if (showError) { throw e }
      return null
    }
  }

  /**
   * A simple pass thru used within the class to reference graphql methods
   * and classes.
   *
   * @return {mixed} the results of `require('graphql')`
   */
  static get gql(): mixed { return require('graphql') }

  /**
   * Shorthand way of invoking `new Schemata(typeDefs, resolvers)`
   *
   * @param {string|Source|Schemata|GraphQLSchema} typeDefs usually a String or
   * other `toString`'able item
   * @param {Object} resolvers an object containing field resolvers for
   * for the schema represented with this string. [Optional]
   * @return {Schemata} an instance of Schemata
   */
  static from(
    typeDefs: string | Source | Schemata | GraphQLSchema,
    resolvers: ?Object
  ): Schemata {
    return new this(typeDefs, resolvers)
  }

  /**
   * Constant used with `forEachOf()` that signifies you wish to iterate
   * over every available type within the schema.
   *
   * @type {number}
   */
  static get ALL(): number { return ALL }

  /**
   * Constant used with `forEachOf()` that signifies you wish to iterate
   * over every available type within the schema.
   *
   * @type {number}
   */
  static get TYPES(): number { return TYPES }

  /**
   * Constant used with `forEachOf()` that signifies you wish to iterate
   * over every available interface within the schema.
   *
   * @type {number}
   */
  static get INTERFACES(): number { return INTERFACES }

  /**
   * Constant used with `forEachOf()` that signifies you wish to iterate
   * over every available enum within the schema.
   *
   * @type {number}
   */
  static get ENUMS(): number { return ENUMS }

  /**
   * Constant used with `forEachOf()` that signifies you wish to iterate
   * over every available union within the schema.
   *
   * @type {number}
   */
  static get UNIONS(): number { return UNIONS }

  /**
   * Constant used with `forEachOf()` that signifies you wish to iterate
   * over every available scalar within the schema.
   *
   * @type {number}
   */
  static get SCALARS(): number { return SCALARS }

  /**
   * Constant used with `forEachOf()` that signifies you wish to iterate
   * over every available root type; Query, Mutation and Subscription
   *
   * @type {number}
   */
  static get ROOT_TYPES(): number { return ROOT_TYPES }

  /**
   * Constant used with `forEachOf()` that signifies you wish to iterate
   * over every available GraphQLInputObjectType within the schema.
   *
   * @type {number}
   */
  static get INPUT_TYPES(): number { return INPUT_TYPES }

  /**
   * Constant used with `forEachOf()` that signifies you also wish to
   * iterate over the meta types. These are denoted by a leading double
   * underscore.
   *
   * Can be OR'ed together such as `Schemata.TYPES | Schemata.HIDDEN`
   *
   * @type {number}
   */
  static get HIDDEN(): number { return HIDDEN }
}

export default Schemata