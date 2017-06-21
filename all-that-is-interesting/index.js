'use strict';

const libingester = require('libingester');
const rss2json = require('rss-to-json');

const RSS_URI = "http://all-that-is-interesting.com/feed/";

//Remove elements (body)
const REMOVE_ELEMENTS = [
    'br + br',
    'hr + p',
    'iframe',
    'noscript',
    'script',
    '.gallery-descriptions-wrap',
    '.gallery-preview',
    '.hidden-md-up',
    '.related-posts',
    '.social-callout',
    '.social-list',
    '.sm-page-count',
    '.twitter_com',
    '.youtube_com',

];

//clean attr (tag)
const REMOVE_ATTR = [
    'class',
    'height',
    'id',
    'sizes',
    'src',
    'srcset',
    'style',
    'width',
];

const CUSTOM_CSS = `
$primary-light-color: #0565A0;
$primary-medium-color: #1B242E;
$primary-dark-color: #020202;
$accent-light-color: #0091EA;
$accent-dark-color: #0078C1;
$background-light-color: #DDDDD5;
$background-dark-color: #E4E4E4;

$title-font: 'Work Sans';
$body-font: 'Open Sans';
$display-font: 'Work Sans';
$logo-font: 'Work Sans';
$context-font: 'Open Sans';
$support-font: 'Work Sans';

$highlighted-background-color: #000000;

@import '_default';
`;

function ingest_post(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.BlogArticle();
        const base_uri = libingester.util.get_doc_base_uri($, uri);

        const by_line = $('.post-heading .container .row .byline').first();
        const author = by_line.find('.author').first().text();
        const published = by_line.find('.date').first().text();
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const read_more = 'Original Article at www.all-that-is-interesting.com/';
        const title = $('meta[property="og:title"]').attr('content');
        const modified_date = $('meta[property="article:modified_time"]').attr('content');
        const description = $('meta[property="og:description"]').attr('content');
        const tags = $('meta[property="article:tag"]').map((i, elem) => $(elem).attr('content')).get();
        const date = new Date(Date.parse(modified_date));
        //main-image
        const main_image = $('meta[property="og:image"]').attr('content');
        const main_img = libingester.util.download_image(main_image, base_uri);
        main_img.set_title(title);
        hatch.save_asset(main_img);
        asset.set_thumbnail(main_img);
        asset.set_main_image(main_img);

        // Article Settings
        console.log('processing: '+ title);
        asset.set_author(author);
        asset.set_synopsis(description);
        asset.set_title(title);
        asset.set_canonical_uri(canonical_uri);
        asset.set_read_more_text(read_more);
        asset.set_tags(tags);
        asset.set_date_published(Date.now(date));
        asset.set_last_modified_date(date);

        let body = $('<div></div>');

        const ingest_body = ($, finish_process) => {
            const post_body = $('article.post-content');
            const info_img = $('.gallery-descriptions-wrap').first();

            //remove elements (body)
            for (const remove_element of REMOVE_ELEMENTS) {
                post_body.find(remove_element).remove();
            }

            post_body.find("img").map(function() {
                const parent = $(this);
                if (this.attribs.src) {
                    const description = this.parent.attribs['aria-describedby'];
                    const figure = $('<figure></figure>').append($(this).clone());
                    if (description) { //save image info
                        const info_image = info_img.find('#' + description).first()[0];
                        let figcaption;
                        if (info_image) {
                            if ($(info_image).text().trim() != '') {
                                figure.append($(`<figcaption><p>${$(info_image).html()}</p></figcaption>`));
                            }
                        }
                        post_body.append(figure);
                        $(this).remove();
                    }
                    else {
                        const fig_description= $(this).parent().find('p').html() || '';
                        if (fig_description.trim() != '') {
                            figure.append($(`<figcaption><p>${fig_description}</p></figcaption>`));
                        }
                        $(this).parent().replaceWith(figure);
                    }

                    const image = libingester.util.download_img($(figure.children()[0]), base_uri);
                    for (const attr of REMOVE_ATTR) {
                        delete this.attribs[attr];
                    }
                    image.set_title(this.attribs.title || title);
                    hatch.save_asset(image);
                }
            });

            //clean image wrap
            post_body.find(".wp-caption").map(function() {
                for (const attr of REMOVE_ATTR) {
                    if (this.attribs[attr]) {
                        delete this.attribs[attr];
                    }
                }
                this.attribs.class = "image-wrap";
            });

            post_body.find('.gallery-section').remove();

            post_body.find(".end-slide").parent().remove();
            body.append(post_body.children());

            const next = $('nav.pagination a.next').attr('href');
            if (next) {
                libingester.util.fetch_html(next).then(($next_profile) => {
                    ingest_body($next_profile, finish_process);
                });
            } else {
                finish_process();
            }
        };

        return new Promise((resolve, reject) => {
            ingest_body($, () => {
                asset.set_body(body);
                asset.set_custom_scss(CUSTOM_CSS);
                asset.render();
                hatch.save_asset(asset);
                resolve();
            });
        });
    });
}

function main() {
    const hatch = new libingester.Hatch('all-that-is-interesting', 'en');

    rss2json.load(RSS_URI, function(err, rss) {
        const post_urls = rss.items.map((datum) => datum.url);
         Promise.all(post_urls.map((uri) => ingest_post(hatch, uri))).then(() => {
            return hatch.finish();
        }).catch((err) => console.log(err));
    });
}

main();
