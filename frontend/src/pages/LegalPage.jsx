import React from 'react';

const content = {
  terms: {
    title: 'Terms of Service',
    intro: 'These terms describe the basic rules for using PharmaLink. By using the service, you agree to use it lawfully and provide accurate information when placing an order or submitting a prescription.',
    sections: [
      ['What PharmaLink does', 'PharmaLink helps customers search medicine listings and connect with participating pharmacies. A listing is not a guarantee that a medicine is still in stock. The pharmacy confirms availability, price, prescription requirements, and fulfillment details.'],
      ['Prescriptions and medicines', 'Prescription medicines require review by an authorized pharmacy professional before dispensing. Uploading a prescription does not guarantee approval or supply. Do not use PharmaLink for diagnosis, treatment advice, or emergency care.'],
      ['Orders and payment', 'An order is subject to pharmacy confirmation. Pickup and delivery options depend on the pharmacy and location. Any payment, refund, or cancellation terms shown during checkout apply to that transaction.'],
      ['Responsible use', 'Do not misuse the service, submit another person’s prescription without authority, or provide false account or order information. Contact the dispensing pharmacy about medicine questions or order changes.'],
      ['Service availability', 'Features and participating pharmacies may change. PharmaLink may be unavailable or display delayed stock information; confirm important details with the pharmacy before travelling.'],
    ],
  },
  privacy: {
    title: 'Privacy & Prescription Safety',
    intro: 'PharmaLink handles account, order, location, and prescription information to provide its pharmacy search and ordering features.',
    sections: [
      ['Information used', 'The service may process account details, contact information, search and approximate location inputs, order details, payment status, and files submitted with a prescription request. Provide only information needed for your request.'],
      ['How it is used', 'Information is used to operate accounts, find pharmacies, process orders, support prescription review, and provide customer support. Prescription files are made available to the pharmacy handling the related request for review.'],
      ['Storage and browser data', 'Some session and preference information is stored in your browser. Signing out removes the authentication token from that browser. Do not use a shared device to access sensitive health information unless you can protect the session.'],
      ['Payments and pharmacy services', 'Payment processing and medicine dispensing involve third-party providers and the selected pharmacy. Their handling of information is governed by their own terms and privacy practices.'],
      ['Your choices', 'You can avoid submitting optional information and can sign out to end access from the current browser. For access, correction, deletion, or questions about a prescription file, contact PharmaLink support through the channel provided by the service.'],
    ],
  },
};

export function LegalPage({ type, onBack }) {
  const page = content[type] || content.terms;
  return (
    <article className="container-page legal-page">
      <button type="button" className="btn btn-outline btn-sm legal-back" onClick={onBack}>Back to PharmaLink</button>
      <p className="legal-eyebrow">GH PharmaLink</p>
      <h1>{page.title}</h1>
      <p className="legal-intro">{page.intro}</p>
      <div className="legal-sections">
        {page.sections.map(([heading, body]) => (
          <section key={heading}>
            <h2>{heading}</h2>
            <p>{body}</p>
          </section>
        ))}
      </div>
      <p className="legal-note">For urgent medical help, contact local emergency services or a licensed healthcare professional.</p>
    </article>
  );
}
