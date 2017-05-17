'use strict';

const template_article = (`
<header>
    <div class="extra-header">
        <div class="context">{{{ category }}}</div>
        <div class="extra-header-right">
            {{{ authors }}}
            <span class="date-published">{{{ published }}}</span>
        </div>
    </div>
    <h1>{{ title }}</h1>
</header>
<figure class="main-image">
    <img data-libingester-asset-id="{{ main_image_id }}">
    <figcaption class="caption-image">{{ main_image_caption }}</figcaption>
</figure>
<section class="post-body">
    {{{ body }}}
</section>
`);

const template_gallery = (`
<header>
    <div class="extra-header">
        <div class="context">{{{ category }}}</div>
        <div class="extra-header-right">
            {{{ authors }}}
            <span class="date-published">{{{ published }}}</span>
        </div>
    </div>
    <h1>{{ title }}</h1>
</header>
<section class="post-body">
    {{{ body_content }}}
    {{{ body_gallery }}}
</section>
`);

const template_video_post = (`
<header>
    <div class="extra-header">
        <div class="context">{{{ category }}}</div>
        <div class="extra-header-right">
            {{{ authors }}}
            <span class="date-published">{{{ published }}}</span>
        </div>
    </div>
    <h1>{{ title }}</h1>
</header>
<section class="main-image">
    <img data-libingester-asset-id="{{ main_image_id }}">
</section>
<section class="post-body">
    {{{ body }}}
</section>
`);

exports.template_article = template_article;
exports.template_gallery = template_gallery;
exports.template_video_post = template_video_post;
