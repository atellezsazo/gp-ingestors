'use strict';

const structure_template = (`
<section class="header">
    <div class="extra-header">
        <div class="context">{{category}}</div>
        <div class="extra-header-right">
            <span class="author">{{author}}</span>
            <span class="date-published">{{date_published}}</span>
        </div>
    </div>
    <h1>{{ title }}</h1>
</section>

{{#main_image}}
  <section class="main-image">
      <img data-libingester-asset-id="{{ main_image.asset_id }}">
      {{#image_credit}}
      <div class="image-credit">{{ image_credit }}</div>
      {{/image_credit}}
  </section>
{{/main_image}}

<section class="body">
    {{{ body }}}
</section>
<section class="footer">
    {{#post_tags}}
    <div class="post-tags">{{{ post_tags }}}</div>
    {{/post_tags}}
</section>
`);

exports.structure_template = structure_template;
