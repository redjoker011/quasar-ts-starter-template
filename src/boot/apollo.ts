import { ApolloClient } from 'apollo-client';
import VueApollo from 'vue-apollo';
import { ApolloLink, concat } from 'apollo-link';
import { HttpLink } from 'apollo-link-http';
import { InMemoryCache, IntrospectionFragmentMatcher } from 'apollo-cache-inmemory';
import * as ActionCable from 'actioncable';
import ActionCableLink from 'graphql-ruby-client/subscriptions/ActionCableLink';
import { getMainDefinition } from 'apollo-utilities';
import fetch from 'unfetch';

// Might change localhost port based on your preference
const HTTP_LOCALHOST = 'http://localhost:3000/graphql'
const WS_LOCALHOST = 'ws://localhost:3000/graphql'

// assign endpoint using dot env variable
const HTTP_ENDPOINT = process.env.GQL_HTTPS_ENDPOINT || HTTP_LOCALHOST
const WS_ENDPOINT = process.env.GQL_WSS_ENDPOINT || WS_LOCALHOST

/**
 * Initialize Fragment Matcher using Fetched Fragment Types in
 * `./fragmentTypes.json`
 * This will allow client to validate and match interfaces and fragments
 * https://www.apollographql.com/docs/react/advanced/fragments.html#fragment-matcher
 *
 * Surprisingly This also works by passing an empty json file which
 *  contain fragment type(seems like a bug?)
 *  see: https://github.com/apollographql/apollo-client/issues/3397
 */
const fragmentMatcher = new IntrospectionFragmentMatcher({
  introspectionQueryResultData: {
    __schema: {
      types: [], // no types provided
    },
  },
});

// Here's how Ruby on Rails Action Cable works with Apollo
const cable = ActionCable.createConsumer(WS_ENDPOINT);

const httpLink = new HttpLink({
  uri: HTTP_ENDPOINT,
  fetch: fetch
});

// add the authorization to the headers
// https://github.com/Akryum/vue-apollo/issues/144
function middleware(token: string | null) {
  return new ApolloLink((operation, forward) => {
    operation.setContext({
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    // issue for argument `forward` cannot invoke an object
    // which is possibly 'undefined'
    // https://github.com/apollographql/apollo-link/issues/362
    if (forward) {
      return forward(operation);
    } else {
      return null;
    }
  });
}

// Might consider change implementation where token were store
// e.g localStorage or Cookie
const storedToken = localStorage.get('token') || '';

// Reason why we dont use createApolloClient builder
// it doesn't support the custom websocket link
// https://github.com/Akryum/vue-cli-plugin-apollo/blob/master/graphql-client/src/index.js#L111
const wsLink = new ActionCableLink({
  cable,
  connectionParams: {
    token: `Bearer ${storedToken}`,
  },
});

const link = ApolloLink.split(
  ({ query }) => {
    const definition = getMainDefinition(query);
    return definition.kind === 'OperationDefinition' && definition.operation === 'subscription';
  },
  wsLink,
  httpLink,
);

let defaultClient: ApolloClient<{}>;

function client(token: string | null) {
  const authMiddleware = middleware(token);

  defaultClient = new ApolloClient({
    link: concat(authMiddleware, link),
    cache: new InMemoryCache({
      fragmentMatcher,
      // Normalize Cached Objects by assigning `uuid` as identifier.
      // This is applicable for `readFragment` which allows us to query
      //  objects in store independently w/out executing `readStore`.
      // https://www.apollographql.com/docs/react/advanced/caching.html
      dataIdFromObject: (object: any) => object.uuid || null,
    }),
  });

  return defaultClient;
}

/**
 * Function for Initializing Apollo Provider
 * To reactively update Authorization Token
 * we pass token as argument upon `Login`.
 * The rest of request tokens are from localStorage.
 */
export function createProvider(token: string | null = storedToken) {
  const apolloProvider = new VueApollo({
    defaultClient: client(token),
  });
  return apolloProvider;
}

/**
 * Asynchronous Function to reset Apollo Store
 * This function initialize Apollo Provider
 * and call `resetStore()` function.
 */
export async function resetStore(event: string) {
  try {
    await defaultClient.resetStore();
  } catch (e) {
    // eslint-disable-next-line no-console
    // tslint:disable-next-line:no-console
    console.log('%cError on cache reset (${event})', 'color: orange;', e.message);
  }
}

export default ({ app, Vue }: { app: any, Vue: any }) => {
  Vue.use(VueApollo)
  app.apolloProvider = createProvider()
}
