import { bindActionCreators } from 'redux';
import { connect } from 'react-redux';
import { actions as formActions } from 'react-redux-form';
import Immutable from 'immutable';

import { DocumentSidePanel } from 'app/Documents';
import { actions as actionCreators } from 'app/BasicReducer';
import { actions } from 'app/Metadata';
import { deleteDocument, searchSnippets } from 'app/Library/actions/libraryActions';
import { deleteEntity } from 'app/Entities/actions/actions';
import { wrapDispatch } from 'app/Multireducer';
import modals from 'app/Modals';

import { getDocumentReferences, unselectAllDocuments, saveDocument } from 'app/Library/actions/libraryActions';
import DocumentForm from 'app/Library/containers/DocumentForm';
import EntityForm from 'app/Library/containers/EntityForm';

const getTemplates = state => state.templates;

const mapStateToProps = ({ semanticSearch, library, templates }) => {
  return {
    open: !semanticSearch.selectedDocument.isEmpty(),
    doc: semanticSearch.selectedDocument,
    references: library.sidepanel.references,
    tab: library.sidepanel.tab,
    docBeingEdited: !!Object.keys(library.sidepanel.metadata).length,
    searchTerm: library.search.searchTerm,
    formDirty: !library.sidepanel.metadataForm.$form.pristine,
    templates,
    formPath: 'library.sidepanel.metadata',
    readOnly: true,
    DocumentForm,
    EntityForm,
    storeKey: 'library'
  };
};

function mapDispatchToProps(dispatch, props) {
  return bindActionCreators({
    loadInReduxForm: actions.loadInReduxForm,
    getDocumentReferences,
    closePanel: unselectAllDocuments,
    resetForm: () => (_dispatch) => {
      _dispatch(formActions.setInitial(`${props.storeKey}.sidepanel.metadata`));
      _dispatch(formActions.reset(`${props.storeKey}.sidepanel.metadata`));
    },
    saveDocument,
    deleteDocument,
    searchSnippets,
    deleteEntity,
    showModal: modals.actions.showModal,
    showTab: tab => actionCreators.set('library.sidepanel.tab', tab)
  }, wrapDispatch(dispatch, props.storeKey));
}

export default connect(mapStateToProps, mapDispatchToProps)(DocumentSidePanel);
