import React from 'react';
import { getPackageInfo, formatPrice } from '../utils/clients';

const ViewClientModal = ({ client, onClose, onEdit, onViewCommunication, onEvaluate, onManageQuestions }) => {
  if (!client) return null;

  const pkg = getPackageInfo(client);

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h3 className="modal-title">{client.clientName}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Business Name</div>
              <div style={{ fontWeight: '500' }}>{client.businessName || 'N/A'}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Package</div>
              <div style={{ fontWeight: '500' }}>
                {pkg.emoji} {pkg.name} - {formatPrice(pkg.price)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Phase</div>
              <div style={{ fontWeight: '500', textTransform: 'capitalize' }}>{client.phase}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Payment Status</div>
              <div style={{ fontWeight: '500', textTransform: 'capitalize' }}>{client.paymentStatus}</div>
            </div>
            {client.evaluationScore !== undefined && (
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Evaluation Score</div>
                <div style={{
                  fontWeight: '600',
                  color: client.evaluationScore >= 70 ? '#22c55e' : client.evaluationScore >= 40 ? '#f59e0b' : '#ef4444',
                  fontSize: '1.125rem'
                }}>
                  {client.evaluationScore}%
                </div>
              </div>
            )}
            {(client.assignedUser || client.assignedTo) && (
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Assigned To</div>
                <div style={{ fontWeight: '500' }}>{client.assignedUser?.name || client.assignedUser?.email || client.assignedTo}</div>
              </div>
            )}
            {client.contactDetails && (
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Contact</div>
                <div style={{ fontWeight: '500' }}>{client.contactDetails}</div>
              </div>
            )}
          </div>
          {client.subscriptionUsageDetail && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '4px' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.75rem', color: 'var(--text-primary)' }}>
                Subscription Usage
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.875rem' }}>
                {client.subscriptionUsageDetail.videosUsed > 0 && (
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>15-sec Videos Used:</span>{' '}
                    <span style={{ fontWeight: '500' }}>{client.subscriptionUsageDetail.videosUsed}</span>
                  </div>
                )}
                {client.subscriptionUsageDetail.mainVideosUsed > 0 && (
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Main Videos Used:</span>{' '}
                    <span style={{ fontWeight: '500' }}>{client.subscriptionUsageDetail.mainVideosUsed}</span>
                  </div>
                )}
                {client.subscriptionUsageDetail.photosUsed > 0 && (
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Photos Used:</span>{' '}
                    <span style={{ fontWeight: '500' }}>{client.subscriptionUsageDetail.photosUsed}</span>
                  </div>
                )}
                {client.subscriptionUsageDetail.meetingMinutesUsed > 0 && (
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Meeting Minutes Used:</span>{' '}
                    <span style={{ fontWeight: '500' }}>{client.subscriptionUsageDetail.meetingMinutesUsed}</span>
                  </div>
                )}
                {(!client.subscriptionUsageDetail.videosUsed &&
                  !client.subscriptionUsageDetail.mainVideosUsed &&
                  !client.subscriptionUsageDetail.photosUsed &&
                  !client.subscriptionUsageDetail.meetingMinutesUsed) && (
                    <div style={{ color: 'var(--text-muted)', gridColumn: '1 / -1' }}>
                      No items used yet
                    </div>
                  )}
              </div>
            </div>
          )}
          {client.notes && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Notes</div>
              <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '4px', whiteSpace: 'pre-wrap' }}>
                {client.notes}
              </div>
            </div>
          )}
          {client.notesMedia && client.notesMedia.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Attached Media</div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                gap: '0.75rem'
              }}>
                {client.notesMedia.map((media) => (
                  <div
                    key={media.id || media.filename}
                    style={{
                      position: 'relative',
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px',
                      overflow: 'hidden',
                      background: 'var(--bg-secondary)'
                    }}
                  >
                    {media.type?.startsWith('image/') ? (
                      <img
                        src={media.url}
                        alt={media.filename}
                        style={{
                          width: '100%',
                          height: '120px',
                          objectFit: 'cover',
                          display: 'block',
                          cursor: 'pointer'
                        }}
                        onClick={() => window.open(media.url, '_blank')}
                        onError={(e) => {
                          e.target.style.display = 'none';
                          if (e.target.nextSibling) {
                            e.target.nextSibling.style.display = 'flex';
                          }
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '100%',
                          height: '120px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'var(--bg-tertiary)',
                          fontSize: '2.5rem',
                          cursor: 'pointer'
                        }}
                        onClick={() => window.open(media.url, '_blank')}
                      >
                        {media.type?.startsWith('video/') ? '🎥' : '📄'}
                      </div>
                    )}
                    <div style={{
                      padding: '0.5rem',
                      fontSize: '0.75rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textAlign: 'center'
                    }}>
                      {media.filename}
                    </div>
                    <a
                      href={media.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        position: 'absolute',
                        bottom: '0.25rem',
                        right: '0.25rem',
                        background: 'rgba(0, 0, 0, 0.7)',
                        color: 'white',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        textDecoration: 'none'
                      }}
                      title="Open in new tab"
                    >
                      🔗
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {onViewCommunication && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  onClose();
                  onViewCommunication();
                }}
              >
                💬 Communication Log
              </button>
            )}
            {onManageQuestions && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  onManageQuestions();
                }}
              >
                📝 Questions
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {client.phase !== 'evaluated' && onEvaluate && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  onEvaluate();
                }}
              >
                🤖 AI Evaluate
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
            <button type="button" className="btn btn-primary" onClick={onEdit}>
              Edit Client
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViewClientModal;

