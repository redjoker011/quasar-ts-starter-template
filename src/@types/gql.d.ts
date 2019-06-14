// Module Typings for graphql files with `gql` extension
// https://github.com/apollographql/graphql-tag/issues/59#issuecomment-303366083
declare module '*.gql' {
  import {DocumentNode} from 'graphql';

  const value: DocumentNode;
  export = value;
}
