// @flow

import * as React from 'react';
import {Map, List} from 'immutable';
import isEqual from 'lodash/isEqual';
import {fetchFromRelation} from "./relationFactory";
import type {RelationDef, FetchFromRelationDef} from "./relationFactory";
import isObject from 'lodash/isObject';
import pick from 'lodash/pick';
import type RefId from 'canner-ref-id';

type Props = {
  refId: RefId,
  rootValue: any,
  keyName: string,
  relation: RelationDef,
  ui: string,
  pattern: string,
  value: any,
  items?: any,
  fetch: FetchDef
};

type State = {
  value: any,
  canRender: boolean
};

export default function createWithRelation(Com: React.ComponentType<*>) {
  return withRelation(Com, fetchFromRelation);
}

export function withRelation(Com: React.ComponentType<*>, fetchFromRelation: FetchFromRelationDef) {
  return class ComponentWithRelation extends React.PureComponent<Props, State> {
    relationList: Array<{
      __key__: string,
      relation: RelationDef
    }>

    constructor(props: Props) {
      super(props);
      this.state = {
        value: null,
        canRender: false
      };
      this.relationList = props.items ? findFromItems(props.items, schema => {
        return schema.type === 'relation';
      }, ['relation', '__key__']) : [];
    }

    componentDidMount() {
      this.fetchRelationValue();
    }

    componentWillReceiveProps(nextProps: Props) {
      const {relation, ui, pattern} = nextProps;
      let thisValue = this.props.value;
      let nextValue = nextProps.value;
      thisValue = (thisValue && thisValue.toJS) ? thisValue.toJS() : thisValue;
      nextValue = (nextValue && nextValue.toJS) ? nextValue.toJS() : nextValue;
      if ((relation || ((ui === 'breadcrumb' || ui === 'popup') && pattern === 'array'))) {
        if (!isEqual(thisValue, nextValue)){
          this.fetchRelationValue(nextProps, {start: 0, limit: 10});
        }
      } else {
        this.setState({
          value: nextProps.value
        });
      }
    }

    fetchRelationValue = (props?: Props, pagination?: {start: number, limit: number}): Promise<*> => {
      const {fetch, items, keyName, refId, rootValue, relation, value, ui, pattern} = props || this.props;
      if (relation) {
        return fetchFromRelation(refId.toString(), relation, {
          entityId: getParentId(rootValue, refId.toString()),
          fieldValue: (value && value.toJS) ? value.toJS() : value
        }, fetch, pagination || {start: 0, limit: 10}).then(data => {
          this.setState({
            value: data,
            canRender: true
          });
        });
      } else if ((ui === 'table-route' || ui === 'table') && pattern === 'array' && items) {
        items.__key__ = keyName;
        return Promise.all(value.map(v => {
          return Promise.all(this.relationList.map(item => {
            const {relation, __key__} = item;
            const isOneToOne = relation.relationship.startsWith('oneToOne');
            const isManyToOne = relation.relationship.startsWith('manyToOne');
            let idList = [];
            if (relation.relationship === 'oneToMany.idMap') {
              idList = idList.concat((v.get(__key__) || new Map()).keySeq().toJS());
            } else {
              idList = idList.concat((v.get(__key__) || []));
            }
            const data = {
              entityId: getParentId(rootValue, refId.toString()),
              fieldValue: isOneToOne || isManyToOne ? idList[0] : idList
            }
            return fetchFromRelation(`${refId.toString()}/__RELATION__`, relation, data, fetch, pagination || {start: 0, limit: 10})
              .then(data => ({
                __key__,
                data
              }));
          })).then(relationValues => {
            return relationValues.reduce((v, {__key__, data}) => v.set(__key__, data), v)
          });
        })).then(data => {
          this.setState({
            value: List(data),
            canRender: true
          });
        });
      }
      return Promise.resolve().then(() => {
        this.setState({
          value,
          canRender: true
        });
      });
    }

    render() {
      const {value, canRender} = this.state;
      if (!canRender)
        return null;
      return <Com {...this.props} fetchRelation={this.fetchRelationValue} value={value}/>;
    }
  };
}

function getParentId(value, id) {
  const idPath = id.split('/').slice(1);
  idPath[idPath.length - 1] = "_id";
  return value.getIn(idPath);
}

function findFromItems(items, filter, rtnField, list) {
  list = list || [];
  if (!isObject(items)) {
    return list;
  }
  if (items && filter(items)) {
    try {
      list.push(pick(items, rtnField));
    } catch (e) {
      list.push(items);
      // eslint-disable-next-line
      console.error(e);
    }
    return list;
  }

  if ('items' in items ) {
    list = list.concat(findFromItems(items.items, filter, rtnField));
  } else {
    list = Object.keys(items).reduce((acc, key) => {
      const item = items[key];
      if (isObject(item)) {
        item.__key__ = key;
        return acc.concat(findFromItems(item, filter, rtnField));
      }
      return acc;
    }, list);
  }
  return list;
}