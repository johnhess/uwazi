import React, { useRef } from 'react';
import { connect } from 'react-redux';
import ReactModal from 'react-modal';
import { Tabs, TabLink, TabContent } from 'react-tabs-redux';
import Dropzone from 'react-dropzone';
import { bindActionCreators, Dispatch } from 'redux';
import { actions as formActions, LocalForm, Field, Errors } from 'react-redux-form';
import Tip from 'app/Layout/Tip';
import { Translate } from 'app/I18N';
import { Icon } from 'app/UI';

const validators = {
  name: { required: (val: any) => !!val && val.trim() !== '' },
  url: { required: (val: any) => !!val && val.trim() !== '' },
};

export interface AttachmentsModalProps {
  isOpen: boolean;
  entitySharedId: string;
  storeKey: string;
  model: string;
  onClose(): void;
  uploadAttachment: (...args: any[]) => (dispatch: Dispatch<{}>) => Promise<any>;
  uploadAttachmentFromUrl: (...args: any[]) => (dispatch: Dispatch<{}>) => void;
  getPercentage?: number;
}

export const AttachmentsModalCmp = ({
  isOpen,
  entitySharedId,
  storeKey,
  model,
  onClose,
  uploadAttachment: uploadAttachmentProp,
  uploadAttachmentFromUrl: uploadAttachmentFromUrlProp,
  getPercentage,
}: AttachmentsModalProps) => {
  const inputFileRef = useRef<HTMLInputElement | null>(null);
  let formDispatch: Function = () => {};

  const handleUploadButtonClicked = () => {
    if (inputFileRef.current) {
      inputFileRef.current.click();
    }
  };

  const handleInputFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      await Promise.all(
        [...event.target.files].map(file =>
          uploadAttachmentProp(entitySharedId, file, storeKey, model)
        )
      );
    }
  };

  const handleDropFiles = async (accepted: File[]) => {
    await Promise.all(
      accepted.map(file => uploadAttachmentProp(entitySharedId, file, storeKey, model))
    );
  };

  const attachDispatch = (dispatch: Function) => {
    formDispatch = dispatch;
  };

  const handleSubmitUrlForm = (formModelData: { url: string; name: string }) => {
    uploadAttachmentFromUrlProp(entitySharedId, formModelData, storeKey, model);
    formDispatch(formActions.reset('urlForm'));
  };

  return (
    <ReactModal
      isOpen={isOpen}
      className="attachments-modal"
      overlayClassName="attachments-modal__overlay"
      ariaHideApp={false}
    >
      <div className="attachments-modal__header">
        <h4>
          <Translate>Supporting files</Translate>
        </h4>

        <button
          type="button"
          onClick={onClose}
          className="attachments-modal__close"
          disabled={getPercentage !== undefined}
        >
          <Icon icon="times" />
          <span>
            <Translate>Cancel</Translate>
          </span>
        </button>
      </div>
      <div className="attachments-modal__content">
        <Tabs renderActiveTabContentOnly>
          <div className="attachments-modal__tabs">
            <TabLink to="uploadComputer" className="tab-link modal-tab-1">
              <Translate>Upload from computer</Translate>
            </TabLink>
            <TabLink to="uploadWeb" className="tab-link modal-tab-2">
              <Translate>Add from web</Translate>
            </TabLink>
          </div>

          <div className="attachments-modal__tabs-content">
            <TabContent for="uploadComputer" className="tab-content centered">
              <Dropzone
                disableClick
                onDrop={handleDropFiles}
                className="attachments-modal__dropzone"
                multiple={false}
              >
                {getPercentage === undefined ? (
                  <>
                    <button
                      type="button"
                      onClick={handleUploadButtonClicked}
                      className="btn btn-success"
                    >
                      <Icon icon="link" />
                      &nbsp; <Translate>Upload and select file</Translate>
                    </button>
                    <input
                      aria-label="fileInput"
                      type="file"
                      onChange={handleInputFileChange}
                      style={{ display: 'none' }}
                      ref={inputFileRef}
                    />
                    <h4 className="attachments-modal__dropzone-title">
                      <Translate>Drag and drop file in this window to upload </Translate>
                    </h4>
                  </>
                ) : (
                  <div className="progress attachments-modal-progress">
                    <div
                      className="progress-bar progress-bar-success attachments-modal-progress-bar"
                      role="progressbar"
                      style={{ width: `${getPercentage}%` }}
                    />
                  </div>
                )}
              </Dropzone>
            </TabContent>
            <TabContent for="uploadWeb" className="tab-content centered">
              <div className="wrapper-web">
                <LocalForm
                  getDispatch={(dispatch: Function) => attachDispatch(dispatch)}
                  onSubmit={handleSubmitUrlForm}
                  model="urlForm"
                  validators={validators}
                >
                  <div className="form-group has-feedback">
                    <Field model=".url">
                      <input
                        type="text"
                        className="form-control web-attachment-url"
                        placeholder="Paste URL here"
                      />
                      <Errors
                        className="validation-error"
                        model=".url"
                        show="touched"
                        messages={{
                          required: 'Url is required',
                        }}
                      />
                    </Field>
                    <Tip icon="info-circle" position="right">
                      <p>
                        <Translate>To get resource from web:</Translate>
                      </p>
                      <p>
                        <Translate>
                          1. Right-click an image or video on the web and copy the image's URL.
                          Altenatively websites offers share button whereyou can get URL.
                        </Translate>
                      </p>
                      <p>
                        <Translate>
                          2. Return here and paste the URL in this field (Ctrl+V or Command+V)
                        </Translate>
                      </p>
                    </Tip>
                  </div>

                  <div className="form-group">
                    <Field model=".name" className="field">
                      <input
                        type="text"
                        className="form-control web-attachment-name"
                        placeholder="Title"
                      />
                      <Errors
                        className="validation-error"
                        model=".name"
                        show="touched"
                        messages={{
                          required: 'Title is required',
                        }}
                      />
                    </Field>
                  </div>

                  <button type="submit" className="btn btn-success">
                    <Icon icon="link" />
                    &nbsp; <Translate>Add resource</Translate>
                  </button>
                </LocalForm>
              </div>
            </TabContent>
          </div>
        </Tabs>
      </div>
    </ReactModal>
  );
};

const mapDispatchToProps = (dispatch: Dispatch<{}>, ownProps: AttachmentsModalProps) =>
  bindActionCreators(
    {
      uploadAttachment: ownProps.uploadAttachment,
      uploadAttachmentFromUrl: ownProps.uploadAttachmentFromUrl,
    },
    dispatch
  );

export const AttachmentsModal = connect(null, mapDispatchToProps)(AttachmentsModalCmp);
