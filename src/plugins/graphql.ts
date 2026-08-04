import path from 'path';
import { loadFilesSync } from '@graphql-tools/load-files';
import { mergeTypeDefs, mergeResolvers } from '@graphql-tools/merge';
import { createSchema, createYoga } from 'graphql-yoga'

const typeDefs = mergeTypeDefs(loadFilesSync(path.join(__dirname, '../modules/**/*.graphql')))
const resolvers = mergeResolvers(loadFilesSync(path.join(__dirname, '../modules/**/*.resolvers.ts')))

export default createYoga({
  schema: createSchema({
    typeDefs,
    resolvers,
  })
})