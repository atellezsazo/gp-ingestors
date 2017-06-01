'use strict';

/*
<section class="main-image">
  <img data-libingester-asset-id="{{ main_image.asset_id }}">
</section>
*/

const structure_template = (`
<section class="header">
  <div class="extra-header">
    <div class="context">{{{category}}}</div>
    <div class="extra-header-right">
      <span class="author">{{author}}</span>
      <span class="dot"> • </span>
      <span class="date-published">{{published_date}}</span>
    </div>
  </div>
  <h1>{{ title }}</h1>
</section>

<section class="body">
  {{{ body }}}
</section>

<section class="footer">
  <div class="tags">{{{tags}}}</div>
</section>
`);

exports.structure_template = structure_template;
